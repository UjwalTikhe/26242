/**
 * AI analysis pipeline.
 *
 * Deterministic-first by design: with no LLM keys configured (AI_MODE=mock,
 * the default in tests/offline) the pipeline still produces a complete,
 * contract-shaped AIAnalysis. Objective tasks are graded from the answer key;
 * evidence tasks are checked for process/integrity compliance and honestly
 * routed to a human when their content cannot be verified without vision/ASR.
 * When an OpenAI-compatible provider is configured the same items are upgraded
 * in place to `llm`/`mixed` with vision checks and ASR transcripts.
 *
 * The pipeline NEVER decides pass/fail — that is the assessor + scoring engine.
 * It only produces per-item suggestions, confidences, flags and routing.
 */
import { randomUUID } from 'node:crypto';
import {
  FLAG_KINDS,
  SEVERITIES,
  TaskAnswers,
  type AIFlag,
  type AIItemScore,
  type EvidenceSpec,
  type KeyframeCheck,
  type NarrationAnalysis,
  type PerformanceCriterion,
  type Severity,
  type Task,
  type TradePack,
} from '@sih/contracts';
import { llmEnabled } from '../config/env.js';
import { conflict, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { logger } from '../logger.js';
import { AIAnalysis, AnalysisJob } from '../models/analysis.models.js';
import {
  Assessment,
  AssessmentPlan,
  Declaration,
  TaskResponse,
  type AssessmentDocument,
  type DeclarationDoc,
  type TaskResponseDoc,
} from '../models/assessment.models.js';
import { Evidence, type EvidenceDoc } from '../models/evidence.models.js';
import { toApi } from '../utils/toApi.js';
import { getAssessmentFor, transitionAssessment } from './assessment.service.js';
import { recordChange } from './changelog.service.js';
import { emitToAssessment, emitToUser } from '../realtime/index.js';
import { gradeObjective, isObjective } from './grading.service.js';
import { getTradePack } from './tradepack.service.js';
import { chatJson, visionJson } from '../ai/llm.js';
import { extractKeyframes, readImage, transcribeEvidence } from '../ai/keyframes.js';

export const PIPELINE_VERSION = 'phase4.1';

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** Drop `undefined` object keys (Mongoose Mixed turns them into `null`, which the contract rejects). */
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function pickText(text: { en: string; hi?: string; mr?: string } | undefined, lang: string): string {
  if (!text) return '';
  const rec = text as Record<string, string | undefined>;
  return rec[lang] ?? rec.en ?? '';
}

/* ------------------------------- flags ------------------------------ */

const processFlag = (message: string, critical = false): AIFlag => ({
  kind: 'process',
  severity: critical ? 'warn' : 'info',
  message,
  evidenceIds: [],
});

const integrityFlag = (message: string, evidenceId: string): AIFlag => ({
  kind: 'integrity',
  severity: 'warn',
  message,
  evidenceIds: [evidenceId],
});

const safetyFlag = (task: Task, score: number): AIFlag => ({
  kind: 'safety_issue',
  severity: 'critical',
  message: `Critical-safety task scored ${(score * 100).toFixed(0)}% — below the pass mark`,
  nosRef: task.nosRefs?.[0],
  criterionRef: task.criteriaRefs?.[0],
  evidenceIds: [],
});

/** Drop hallucinated kinds/severities; coerce times to numbers. */
function sanitizeFlags(raw: unknown, task: Task, evs: EvidenceDoc[]): AIFlag[] {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<string>(FLAG_KINDS);
  const severities = new Set<string>(SEVERITIES);
  const out: AIFlag[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    if (typeof f.message !== 'string') continue;
    out.push({
      kind: (typeof f.kind === 'string' && kinds.has(f.kind) ? f.kind : 'quality') as AIFlag['kind'],
      severity: (typeof f.severity === 'string' && severities.has(f.severity) ? f.severity : 'info') as Severity,
      message: f.message.slice(0, 500),
      nosRef: task.nosRefs?.[0],
      criterionRef: typeof f.criterionRef === 'string' ? f.criterionRef : undefined,
      timestampSec: typeof f.timestampSec === 'number' ? f.timestampSec : undefined,
      evidenceIds: evs.map((e) => e._id),
    });
  }
  return out;
}

/* -------------------------- evidence checks ------------------------- */

function specFlags(task: Task, evs: EvidenceDoc[]): AIFlag[] {
  const flags: AIFlag[] = [];
  const spec = task.evidenceSpec as EvidenceSpec | undefined;
  if (spec) {
    const min = spec.minCount ?? 1;
    if (evs.length < min) {
      flags.push(processFlag(`Expected at least ${min} evidence item(s), found ${evs.length}`, task.criticalSafety));
    }
    if (spec.requireGps && evs.some((e) => !e.gps)) {
      flags.push(processFlag('Evidence is missing required GPS metadata', false));
    }
    if (spec.requireWorkerInFrame && !llmEnabled) {
      flags.push(processFlag('Worker-in-frame check needs vision review', false));
    }
  }
  for (const ev of evs) {
    if (ev.integrity?.clientSha256 && !ev.integrity?.hashVerified) {
      flags.push(integrityFlag('Device hash did not match the server hash', ev._id));
    }
  }
  return flags;
}

/* --------------------------- narration ------------------------------ */

interface NarrationSource {
  text: string;
  language?: string;
  evidenceId?: string;
}

function narrationSource(
  task: Task,
  evs: EvidenceDoc[],
  declaration: DeclarationDoc | null,
  response: TaskResponseDoc | undefined,
): NarrationSource | null {
  for (const ev of evs) {
    if (ev.narration?.text) {
      return { text: ev.narration.text, language: ev.narration.language ?? ev.language, evidenceId: ev._id };
    }
  }
  const textAnswer = (response?.answers as { textAnswer?: string } | undefined)?.textAnswer;
  if (textAnswer) return { text: textAnswer };

  const voice = (declaration?.voiceAnswers ?? []) as Array<{
    questionId?: string;
    transcript?: string;
    language?: string;
    evidenceId?: string;
  }>;
  const match = voice.find((v) => v.questionId === task.id && v.transcript);
  if (match?.transcript) {
    return { text: match.transcript, language: match.language, evidenceId: match.evidenceId };
  }
  return null;
}

function keywordScore(task: Task, pcMap: Map<string, PerformanceCriterion>, text: string) {
  const keywords = new Set<string>();
  for (const ref of task.criteriaRefs ?? []) {
    for (const kw of pcMap.get(ref)?.keywords ?? []) keywords.add(kw.toLowerCase());
  }
  const lower = text.toLowerCase();
  const hits = [...keywords].filter((kw) => lower.includes(kw));
  const coverage = keywords.size > 0 ? hits.length / keywords.size : 0;
  return { hits, coverage, total: keywords.size };
}

/* ------------------------------ vision ------------------------------ */

interface EvidenceFrames {
  ev: EvidenceDoc;
  frames: { timestampSec: number; jpeg: Buffer }[];
}

interface ScoredEvidence {
  score: number;
  confidence: number;
  flags: AIFlag[];
  keyframes: KeyframeCheck[];
  requiresHuman: boolean;
  model: string;
  provider: string;
}

async function collectFrames(evs: EvidenceDoc[]): Promise<EvidenceFrames[]> {
  const out: EvidenceFrames[] = [];
  for (const ev of evs) {
    if (ev.kind === 'photo') {
      const jpeg = await readImage(ev.storageKey);
      if (jpeg) out.push({ ev, frames: [{ timestampSec: 0, jpeg }] });
    } else if (ev.kind === 'video') {
      const frames = await extractKeyframes(ev.storageKey, 4);
      if (frames.length > 0) out.push({ ev, frames });
    }
  }
  return out;
}

async function runVisionTask(
  task: Task,
  evs: EvidenceDoc[],
  pcMap: Map<string, PerformanceCriterion>,
  humanRoute: number,
): Promise<ScoredEvidence | null> {
  const bundles = await collectFrames(evs);
  const images = bundles.flatMap((b) => b.frames.map((f) => f.jpeg));
  if (images.length === 0) return null;

  const rubric = (task.criteriaRefs ?? [])
    .map((ref) => {
      const pc = pcMap.get(ref);
      return pc
        ? `- [${pc.id}] ${pc.text}${pc.criticalSafety ? ' (CRITICAL SAFETY)' : ''}`
        : `- [${ref}]`;
    })
    .join('\n');

  const prompt = [
    'You are an NSQF competency assessor reviewing worker evidence.',
    `Task: ${pickText(task.title, 'en')}`,
    'Score how well the evidence demonstrates each rubric criterion.',
    'Respond with ONLY a JSON object:',
    '{ "score": <0..1 overall>, "confidence": <0..1>,',
    '  "checks": { "<criterionRef>": <true|false> },',
    '  "flags": [{ "kind": <missing_step|safety_issue|quality|integrity|consistency|process>,',
    '              "severity": <info|warn|critical>, "message": string, "criterionRef": string }],',
    '  "summary": string }',
    'Rubric:',
    rubric,
  ].join('\n');

  const res = await visionJson(prompt, images);
  const parsed = (res.data ?? {}) as Record<string, unknown>;
  const score = clamp(num(parsed.score, 0));
  const confidence = clamp(num(parsed.confidence, 0));
  const checks = (parsed.checks && typeof parsed.checks === 'object' ? parsed.checks : {}) as Record<
    string,
    boolean | number | string
  >;
  const flags = sanitizeFlags(parsed.flags, task, evs);

  const keyframes: KeyframeCheck[] = bundles.map((b) => ({
    evidenceId: b.ev._id,
    timestampSec: b.frames[0].timestampSec,
    storageKey: b.ev.storageKey,
    checks,
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : undefined,
  }));

  return {
    score,
    confidence,
    flags,
    keyframes,
    requiresHuman: confidence < humanRoute,
    model: res.model,
    provider: res.provider,
  };
}

/* --------------------------- narration score ------------------------ */

interface NarrationScore {
  score: number;
  confidence: number;
  flags: AIFlag[];
  keywordHits: string[];
  routing: AIItemScore['routing'];
  requiresHuman: boolean;
  model?: string;
  provider?: string;
  usedLlm: boolean;
}

async function runNarrationTask(
  task: Task,
  pcMap: Map<string, PerformanceCriterion>,
  text: string,
  humanRoute: number,
): Promise<NarrationScore> {
  const kw = keywordScore(task, pcMap, text);

  if (llmEnabled) {
    try {
      const rubric = (task.criteriaRefs ?? [])
        .map((ref) => {
          const pc = pcMap.get(ref);
          return pc ? `- [${pc.id}] ${pc.text}` : `- [${ref}]`;
        })
        .join('\n');
      const res = await chatJson([
        {
          role: 'system',
          content:
            'You are an NSQF assessor scoring a worker\'s spoken narration. Respond with ONLY JSON: ' +
            '{ "score": <0..1>, "confidence": <0..1>, "flags": [{ "kind": string, "severity": string, "message": string }] }.',
        },
        { role: 'user', content: `Rubric:\n${rubric}\n\nNarration:\n${text}` },
      ]);
      const parsed = (res.data ?? {}) as Record<string, unknown>;
      const score = clamp(num(parsed.score, kw.coverage));
      const confidence = clamp(num(parsed.confidence, 0));
      const requiresHuman = confidence < humanRoute;
      return {
        score,
        confidence,
        flags: sanitizeFlags(parsed.flags, task, []),
        keywordHits: kw.hits,
        routing: requiresHuman ? 'human_required' : 'ai_assist',
        requiresHuman,
        model: res.model,
        provider: res.provider,
        usedLlm: true,
      };
    } catch (err) {
      logger.warn({ err, taskId: task.id }, 'narration LLM scoring failed — using keyword fallback');
    }
  }

  const score = clamp(kw.coverage);
  const confidence = clamp(0.5 + 0.5 * kw.coverage);
  const requiresHuman = kw.total === 0 || confidence < humanRoute;
  return {
    score,
    confidence,
    flags: [],
    keywordHits: kw.hits,
    routing: requiresHuman ? 'human_required' : 'ai_assist',
    requiresHuman,
    usedLlm: false,
  };
}

/* --------------------------- build analysis ------------------------- */

interface BuildArgs {
  assessment: AssessmentDocument;
  tasks: Task[];
  responseByTask: Map<string, TaskResponseDoc>;
  evidenceByTask: Map<string, EvidenceDoc[]>;
  pack: TradePack;
  declaration: DeclarationDoc | null;
}

interface BuiltAnalysis {
  mode: 'llm' | 'fallback' | 'mixed';
  provider?: string;
  models: { llm?: string; vision?: string; asr?: string };
  items: AIItemScore[];
  keyframes: KeyframeCheck[];
  narration: NarrationAnalysis[];
  safetySummary: { criticalFlags: number; issues: number };
  pendingHumanTasks: string[];
}

function humanItem(task: Task, score: number | null, flags: AIFlag[], note: string, confidence = 0): AIItemScore {
  return {
    taskId: task.id,
    criterionRef: task.criteriaRefs?.[0],
    routing: 'human_required',
    criticalSafety: task.criticalSafety,
    aiScore: score,
    confidence,
    flags,
    requiresHuman: true,
    note,
  };
}

async function buildAnalysis(args: BuildArgs): Promise<BuiltAnalysis> {
  const { assessment, tasks, responseByTask, evidenceByTask, pack, declaration } = args;
  const pcMap = new Map<string, PerformanceCriterion>(
    pack.nos.flatMap((n) => n.performanceCriteria).map((pc) => [pc.id, pc]),
  );
  const thresholds = pack.thresholds;
  // pack-level threshold wins; env is the global default the pack schema already seeds
  const humanRoute = thresholds.confidenceHumanRoute;

  const items: AIItemScore[] = [];
  const keyframes: KeyframeCheck[] = [];
  const narration: NarrationAnalysis[] = [];
  const models: BuiltAnalysis['models'] = {};
  let provider: string | undefined;
  let usedLlm = false;
  let usedFallback = false;

  for (const task of tasks) {
    const response = responseByTask.get(task.id);
    const evs = evidenceByTask.get(task.id) ?? [];
    const baseFlags = specFlags(task, evs);

    /* ---- objective tasks: deterministic answer key ---- */
    if (isObjective(task.type)) {
      let autoScore = response?.autoScore as { score?: number } | undefined;
      if (response && !autoScore) {
        const graded = gradeObjective(task, TaskAnswers.parse(response.answers));
        if (graded) {
          autoScore = graded;
          await TaskResponse.updateOne({ _id: response._id }, { $set: { autoScore: graded } });
        }
      }
      const score = typeof autoScore?.score === 'number' ? clamp(autoScore.score) : null;
      if (score === null) {
        items.push(humanItem(task, null, [...baseFlags, processFlag('No answer submitted for this task', task.criticalSafety)], 'No answer to grade'));
        continue;
      }
      const pass = score >= thresholds.perTaskPass;
      const criticalFail = task.criticalSafety && thresholds.criticalMustPass && !pass;
      const flags = [...baseFlags];
      if (criticalFail) flags.push(safetyFlag(task, score));
      items.push({
        taskId: task.id,
        criterionRef: task.criteriaRefs?.[0],
        routing: criticalFail ? 'human_required' : 'auto',
        criticalSafety: task.criticalSafety,
        aiScore: score,
        confidence: 1,
        flags,
        requiresHuman: criticalFail,
        note: criticalFail ? 'Critical-safety failure — assessor confirmation required' : undefined,
      });
      continue;
    }

    /* ---- evidence tasks ---- */
    if (task.type === 'practical_photo' || task.type === 'practical_video') {
      if (evs.length === 0) {
        items.push(
          humanItem(task, null, [...baseFlags, processFlag('Required visual evidence is missing', task.criticalSafety)], 'No evidence uploaded'),
        );
        continue;
      }
      if (llmEnabled) {
        try {
          const vision = await runVisionTask(task, evs, pcMap, humanRoute);
          if (vision) {
            usedLlm = true;
            provider = vision.provider ?? provider;
            models.vision = vision.model;
            models.llm = models.llm ?? vision.model;
            keyframes.push(...vision.keyframes);
            items.push({
              taskId: task.id,
              criterionRef: task.criteriaRefs?.[0],
              routing: vision.requiresHuman ? 'human_required' : 'ai_assist',
              criticalSafety: task.criticalSafety,
              aiScore: vision.score,
              confidence: vision.confidence,
              flags: [...baseFlags, ...vision.flags],
              requiresHuman: vision.requiresHuman,
              note: vision.requiresHuman ? 'Low vision confidence — assessor should confirm' : 'Vision-suggested score',
            });
            continue;
          }
        } catch (err) {
          logger.warn({ err, taskId: task.id }, 'vision scoring failed — routing to human');
        }
      }
      usedFallback = true;
      items.push(
        humanItem(
          task,
          null,
          baseFlags,
          llmEnabled ? 'Vision review unavailable — assessor to verify media' : 'Visual verification requires an assessor (vision model not configured)',
        ),
      );
      continue;
    }

    if (task.type === 'narration') {
      const source = narrationSource(task, evs, declaration, response);
      let transcript = source?.text;
      let evidenceId = source?.evidenceId;
      let language = source?.language ?? assessment.language;

      if (!transcript && llmEnabled) {
        const audio = evs.find((e) => e.kind === 'audio');
        if (audio) {
          const asr = await transcribeEvidence(audio.storageKey, audio.language ?? assessment.language);
          if (asr?.transcript) {
            usedLlm = true;
            transcript = asr.transcript;
            evidenceId = audio._id;
            language = audio.language ?? assessment.language;
            provider = asr.provider ?? provider;
            models.asr = asr.model;
          }
        }
      }

      if (!transcript) {
        items.push(
          humanItem(task, null, [...baseFlags, processFlag('No narration transcript available', task.criticalSafety)], 'Narration not available — assessor to review audio'),
        );
        continue;
      }

      const scored = await runNarrationTask(task, pcMap, transcript, humanRoute);
      usedLlm = usedLlm || scored.usedLlm;
      usedFallback = usedFallback || !scored.usedLlm;
      provider = scored.provider ?? provider;
      if (scored.model) models.llm = scored.model;

      let requiresHuman = scored.requiresHuman;
      const flags = [...baseFlags, ...scored.flags];
      if (task.criticalSafety && scored.score < thresholds.perTaskPass) {
        requiresHuman = true;
        flags.push(safetyFlag(task, scored.score));
      }

      if (evidenceId) {
        narration.push({
          evidenceId,
          transcript,
          language: language as NarrationAnalysis['language'],
          flags: scored.flags,
          keywordHits: scored.keywordHits,
        });
      }

      items.push({
        taskId: task.id,
        criterionRef: task.criteriaRefs?.[0],
        routing: requiresHuman ? 'human_required' : 'ai_assist',
        criticalSafety: task.criticalSafety,
        aiScore: scored.score,
        confidence: scored.confidence,
        flags,
        requiresHuman,
        note: scored.keywordHits.length > 0 ? `Rubric keywords heard: ${scored.keywordHits.join(', ')}` : undefined,
      });
      continue;
    }
  }

  const mode: BuiltAnalysis['mode'] = usedLlm && usedFallback ? 'mixed' : usedLlm ? 'llm' : 'fallback';

  applyConsistencyFlags(items, declaration, thresholds.consistencyFlagThreshold);

  const allFlags = items.flatMap((i) => i.flags);
  return {
    mode,
    provider,
    models,
    items,
    keyframes,
    narration,
    safetySummary: {
      criticalFlags: allFlags.filter((f) => f.severity === 'critical').length,
      issues: allFlags.length,
    },
    pendingHumanTasks: items.filter((i) => i.requiresHuman).map((i) => i.taskId),
  };
}

/** Declaration-vs-performance gap → a single consistency flag on the weakest item. */
function applyConsistencyFlags(items: AIItemScore[], declaration: DeclarationDoc | null, threshold: number): void {
  const scored = items.filter((i) => typeof i.aiScore === 'number');
  if (scored.length === 0 || !declaration) return;
  const perf = scored.reduce((acc, i) => acc + (i.aiScore as number), 0) / scored.length;
  const answers = (declaration.answers ?? {}) as Record<string, unknown>;
  const years = typeof answers.yearsExperience === 'number' ? answers.yearsExperience : 0;
  const can = Array.isArray(answers.tasksCanPerform) ? answers.tasksCanPerform.length : 0;
  const self = clamp(Math.min(1, (years / 8) * 0.6 + (Math.min(can, 10) / 10) * 0.4));
  const gap = self - perf;
  if (gap <= threshold) return;
  const weakest = [...scored].sort((a, b) => (a.aiScore as number) - (b.aiScore as number))[0];
  weakest.flags.push({
    kind: 'consistency',
    severity: 'warn',
    message: `Self-declaration is optimistic vs demonstrated performance (declared ~${(self * 100).toFixed(0)}% vs ${(perf * 100).toFixed(0)}%)`,
    evidenceIds: [],
  });
}

/* --------------------------- public API ----------------------------- */

/** Run the full pipeline for an assessment. Idempotent for replays. */
export async function analyzeAssessment(assessmentId: string): Promise<void> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (assessment.status !== 'SUBMITTED' && assessment.status !== 'AI_ANALYZED') {
    return; // nothing to do (or already past analysis)
  }

  await AnalysisJob.findOneAndUpdate(
    { assessmentId },
    {
      $set: { state: 'running', startedAt: new Date(), driver: 'inline' },
      $setOnInsert: { _id: randomUUID(), assessmentId, queuedAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  );

  try {
    const plan = await AssessmentPlan.findOne({ assessmentId }).lean();
    if (!plan) throw conflict('no_plan', 'Cannot analyze an assessment without a generated plan');
    const pack = await getTradePack(plan.tradePackId);
    const round = assessment.round;

    const [responses, evidence, declaration] = await Promise.all([
      TaskResponse.find({ assessmentId, round }).lean(),
      Evidence.find({ assessmentId }).lean(),
      Declaration.findOne({ assessmentId }).lean(),
    ]);

    const tasks = (plan.tasks ?? []) as unknown as Task[];
    const responseByTask = new Map(responses.map((r) => [r.taskId, r]));
    const evidenceByTask = new Map<string, EvidenceDoc[]>();
    for (const ev of evidence as EvidenceDoc[]) {
      if (!ev.taskId) continue;
      const bucket = evidenceByTask.get(ev.taskId);
      if (bucket) bucket.push(ev);
      else evidenceByTask.set(ev.taskId, [ev]);
    }

    await Evidence.updateMany({ assessmentId }, { $set: { status: 'analyzing' } });

    const built = await buildAnalysis({
      assessment,
      tasks,
      responseByTask,
      evidenceByTask,
      pack,
      declaration: declaration as DeclarationDoc | null,
    });

    const now = new Date();
    const doc = await AIAnalysis.findOneAndUpdate(
      { assessmentId, round },
      {
        $set: {
          mode: built.mode,
          provider: built.provider,
          models: clean(built.models),
          items: clean(built.items),
          keyframes: clean(built.keyframes),
          narration: clean(built.narration),
          safetySummary: built.safetySummary,
          pendingHumanTasks: built.pendingHumanTasks,
          pipelineVersion: PIPELINE_VERSION,
          computedAt: now,
        },
        $setOnInsert: { _id: randomUUID(), assessmentId, round },
      },
      { upsert: true, returnDocument: 'after' },
    );

    await Evidence.updateMany({ assessmentId, status: 'analyzing' }, { $set: { status: 'analyzed' } });

    if (assessment.status === 'SUBMITTED') {
      await transitionAssessment(assessmentId, 'AI_ANALYZED', { note: `auto-analysis ${PIPELINE_VERSION}` });
    }

    await AnalysisJob.findOneAndUpdate(
      { assessmentId },
      { $set: { state: 'done', finishedAt: new Date(), message: undefined } },
    );

    await recordChange({
      entity: 'analysis',
      id: String(doc._id),
      ownerId: assessment.workerId,
      updatedAt: now,
      data: toApi(doc.toObject()),
    });

    emitToAssessment(assessmentId, 'analysis:ready', {
      assessmentId,
      round,
      mode: built.mode,
      pendingHumanTasks: built.pendingHumanTasks,
      at: now.toISOString(),
    });
    emitToUser(assessment.workerId, 'analysis:ready', { assessmentId, round, at: now.toISOString() });
  } catch (err) {
    await AnalysisJob.findOneAndUpdate(
      { assessmentId },
      {
        $set: {
          state: 'error',
          finishedAt: new Date(),
          message: err instanceof Error ? err.message : String(err),
        },
      },
    );
    await Evidence.updateMany({ assessmentId, status: 'analyzing' }, { $set: { status: 'error' } });
    throw err;
  }
}

/** Analysis for the assessment's current round (404 until it exists). */
export async function getAnalysisFor(assessmentId: string, user: AuthUser): Promise<unknown> {
  const assessment = await getAssessmentFor(assessmentId, user);
  const doc = await AIAnalysis.findOne({ assessmentId, round: assessment.round }).lean();
  if (!doc) throw notFound('AI analysis is not available yet');
  return toApi(doc);
}

export async function getAnalysisStatus(assessmentId: string, user: AuthUser): Promise<unknown> {
  await getAssessmentFor(assessmentId, user);
  const job = await AnalysisJob.findOne({ assessmentId }).lean();
  if (!job) {
    const done = await AIAnalysis.exists({ assessmentId });
    return { state: done ? 'done' : 'none' };
  }
  return {
    state: job.state,
    queuedAt: job.queuedAt ? new Date(job.queuedAt).toISOString() : undefined,
    message: job.message,
  };
}
