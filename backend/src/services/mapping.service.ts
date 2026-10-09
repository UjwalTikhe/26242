/**
 * NSQF / QP mapping — chooses the top-3 trade-pack candidates for an
 * assessment from the worker's declaration signals.
 *
 * Phase 2 ships the deterministic path (`mode: 'fallback'`): transparent,
 * testable, works offline. The contract has `mode: 'llm' | 'mixed'` ready —
 * when AI keys are configured (Phase 4) an LLM re-ranker can be layered on
 * top and will set mode/provider/model accordingly. Pass/fail is NEVER
 * decided here — only candidate ranking.
 *
 * Signals used (all from the submitted declaration + creation hint):
 *  - tradeHint / pack aliases + titles   (strong)
 *  - declared workTypes, toolsUsed, tasksCanPerform, sectors
 *    → token overlap against pack tools, NOS/PC text and keywords
 *  - yearsExperience → NSQF level plausibility note in the reasoning
 */
import { randomUUID } from 'node:crypto';
import type { QPMatchCandidate, TradePack } from '@sih/contracts';
import { conflict, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import {
  Assessment,
  Declaration,
  QPMatch,
} from '../models/assessment.models.js';
import { toApi } from '../utils/toApi.js';
import { getAllTradePacks } from './tradepack.service.js';
import { assertTransition } from './stateMachine.js';
import { onStatusChanged } from './statusEvents.js';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'with',
  'from', 'by', 'is', 'are', 'work', 'works', 'job', 'other', 'misc',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function uniq(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

interface PackScore {
  pack: TradePack;
  score: number;
  matched: string[];
  /** The worker's explicit trade hint pointed at THIS pack — decisive. */
  hintMatched: boolean;
}

function scorePack(pack: TradePack, tokens: string[], hint: string | undefined): PackScore {
  let score = 0;
  let hintMatched = false;
  const matched: string[] = [];
  const seen = new Set<string>();
  const hit = (token: string, weight: number) => {
    if (seen.has(token)) return;
    seen.add(token);
    score += weight;
    matched.push(token);
  };

  // 1) trade hint vs pack id / aliases / title (strong signal)
  if (hint) {
    const h = hint.toLowerCase().trim();
    const hay = [pack.id, ...pack.aliases, pack.title.en, pack.title.hi ?? ''].join(' ').toLowerCase();
    if (h.length >= 3 && hay.includes(h)) {
      hintMatched = true;
      hit(h, 6);
    } else {
      for (const t of tokenize(h)) {
        if (hay.includes(t)) {
          hintMatched = true;
          hit(t, 6);
        }
      }
    }
  }

  // 2) declaration tokens vs tool names/aliases
  for (const tool of pack.tools) {
    const toolHay = [tool.name.en, tool.name.hi ?? '', ...tool.aliases].join(' ').toLowerCase();
    for (const t of tokens) {
      if (toolHay.includes(t)) hit(t, 2);
    }
  }

  // 3) declaration tokens vs NOS codes/titles, PC text + keywords, safety topics
  for (const nos of pack.nos) {
    const nosHay = `${nos.code} ${nos.title}`.toLowerCase();
    for (const t of tokens) {
      if (nosHay.includes(t)) hit(t, 1.5);
    }
    for (const pc of nos.performanceCriteria) {
      const pcHay = `${pc.text} ${pc.keywords.join(' ')}`.toLowerCase();
      for (const t of tokens) {
        if (pcHay.includes(t)) hit(t, 1);
      }
    }
  }
  for (const topic of pack.safetyTopics) {
    const hay = topic.text.en.toLowerCase();
    for (const t of tokens) {
      if (hay.includes(t)) hit(t, 0.5);
    }
  }

  // 4) declared sectors/qp alignment
  const qpHay = `${pack.qp.title} ${pack.qp.alignedJobRoles.join(' ')}`.toLowerCase();
  for (const t of tokens) {
    if (qpHay.includes(t)) hit(t, 1);
  }

  return { pack, score, matched, hintMatched };
}

function levelPlausibility(years: number | undefined, pack: TradePack): string {
  if (years === undefined) return '';
  const band = years < 2 ? 'entry' : years < 5 ? 'developing' : 'experienced';
  return ` ${years} year(s) of declared experience reads as ${band} proficiency; pack targets NSQF level ${pack.qp.nsqfLevel}.`;
}

export async function mapAssessment(
  assessmentId: string,
  user: AuthUser,
  input: { tradeHint?: string },
): Promise<{ match: unknown; created: boolean }> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (assessment.workerId !== user.id) throw notFound('Assessment not found');

  // idempotent replay: a stored match always replays cleanly (offline sync),
  // with a repair advance if a previous write crashed between the two steps
  const existing = await QPMatch.findOne({ assessmentId }).lean();
  if (existing) {
    if (assessment.status === 'DECLARED') {
      await Assessment.findOneAndUpdate(
        { _id: assessmentId, status: 'DECLARED' },
        {
          $set: { status: 'MAPPED' },
          $push: { statusHistory: { status: 'MAPPED', at: new Date(), by: user.id } },
          $inc: { version: 1 },
        },
      );
    }
    return { match: toApi(existing), created: false };
  }

  assertTransition(assessment.status, 'MAPPED');
  if (assessment.status !== 'DECLARED') {
    throw conflict('invalid_transition', `Mapping requires DECLARED (current: ${assessment.status})`);
  }

  const packs = await getAllTradePacks();
  if (packs.length === 0) throw notFound('No trade packs configured');

  const declaration = await Declaration.findOne({ assessmentId }).lean();
  const answers = (declaration?.answers ?? {}) as Record<string, unknown>;

  const hint = input.tradeHint ?? assessment.tradeHint;
  const declaredText = [
    ...(Array.isArray(answers.workTypes) ? answers.workTypes : []),
    ...(Array.isArray(answers.toolsUsed) ? answers.toolsUsed : []),
    ...(Array.isArray(answers.tasksCanPerform) ? answers.tasksCanPerform : []),
    ...(Array.isArray(answers.sectors) ? answers.sectors : []),
  ]
    .map(String)
    .join(' ');
  const tokens = uniq(tokenize(declaredText));
  const years = typeof answers.yearsExperience === 'number' ? answers.yearsExperience : undefined;

  // The explicit hint is the worker's own statement of their trade — it
  // outranks declaration-token volume (a big pack can out-score a small one
  // on generic tokens like "wire" alone). Ties break on signal score.
  const ranked = packs
    .map((pack) => scorePack(pack, tokens, hint))
    .sort((a, b) => Number(b.hintMatched) - Number(a.hintMatched) || b.score - a.score);

  const maxScore = Math.max(0, ...ranked.map((r) => r.score));
  const winnerHint = ranked[0]?.hintMatched ?? false;

  const matches: QPMatchCandidate[] = ranked.slice(0, 3).map((r, i) => {
    const ratio = maxScore > 0 ? r.score / maxScore : 0;
    // squash to 0..1: winner with real signals ≈ 0.95, weaker candidates fall
    // off proportionally; no signals at all → honest low-confidence defaults.
    // When the hint picked the winner, the runner-ups read as candidates for
    // the WRONG trade (capped ≈0.6) so confidence stays discriminating.
    const confidence =
      r.score <= 0
        ? Math.max(0.15, 0.4 - i * 0.1)
        : i === 0 && r.hintMatched
          ? 0.95
          : winnerHint
            ? Math.round((0.15 + 0.45 * ratio) * 100) / 100
            : Math.round((0.35 + 0.6 * ratio) * 100) / 100;
    return {
      tradePackId: r.pack.id,
      qpTitle: r.pack.qp.title,
      jobRole: r.pack.qp.alignedJobRoles[0],
      nsqfLevel: r.pack.qp.nsqfLevel,
      confidence: Math.round(confidence * 100) / 100,
      reasoning:
        `Matched ${r.matched.length} signal(s)` +
        (r.matched.length ? `: ${r.matched.slice(0, 10).join(', ')}` : ' — falling back to available packs') +
        `.${levelPlausibility(years, r.pack)}`,
      matchedConcepts: r.matched.slice(0, 12),
    };
  });
  // contract/UI expect confidence desc — clamp any inversion from defaults
  for (let i = 1; i < matches.length; i++) {
    if (matches[i].confidence > matches[i - 1].confidence) {
      matches[i].confidence = matches[i - 1].confidence;
    }
  }

  const doc = await QPMatch.create({
    _id: randomUUID(),
    assessmentId,
    matches,
    mode: 'fallback',
  });

  // DECLARED → MAPPED (conditional; replay-safe)
  const advanced = await Assessment.findOneAndUpdate(
    { _id: assessmentId, status: 'DECLARED' },
    {
      $set: { status: 'MAPPED' },
      $push: { statusHistory: { status: 'MAPPED', at: new Date(), by: user.id } },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!advanced) {
    // someone else advanced it concurrently — the match we wrote is still the
    // stored one; surface it rather than failing the replay
    const race = await QPMatch.findOne({ assessmentId }).lean();
    if (race) return { match: toApi(race), created: true };
    throw conflict('invalid_transition', 'Assessment left DECLARED during mapping');
  }
  await onStatusChanged({
    assessmentId,
    from: 'DECLARED',
    to: 'MAPPED',
    workerId: assessment.workerId,
    version: advanced.version,
    round: advanced.round,
    actorId: user.id,
    actorRole: user.role,
  });

  return { match: toApi(doc.toObject()), created: true };
}

export async function getMappingFor(assessmentId: string, user: AuthUser): Promise<unknown> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (user.role === 'worker' && assessment.workerId !== user.id) {
    throw notFound('Assessment not found');
  }
  const match = await QPMatch.findOne({ assessmentId }).lean();
  if (!match) throw notFound('No mapping for this assessment yet');
  return toApi(match);
}
