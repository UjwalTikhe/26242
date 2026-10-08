/**
 * Assessment plan generator — expands trade-pack task blueprints into
 * concrete, presentable tasks for one assessment.
 *
 * Design notes:
 *  - Deterministic: everything is seeded by assessment id, so an offline
 *    replay after a lost response regenerates the identical plan.
 *  - The answer key (`correctIds`) exists only in this document; every
 *    worker-facing response strips it (PlanRes' correctIds then defaults to []
 *    under Zod, so contract conformance is preserved).
 *  - mcq blueprints expand to one task per bank question with the blueprint
 *    weight split evenly (keeps total weight = 100 while covering the bank).
 */
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { ChecklistItem, GeneratePlanReq, TaskBlueprint, TradePack } from '@sih/contracts';
import { conflict, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import {
  Assessment,
  AssessmentPlan,
  QPMatch,
} from '../models/assessment.models.js';
import { toApi } from '../utils/toApi.js';
import { getTradePack } from './tradepack.service.js';
import { assertTransition } from './stateMachine.js';

/* --------------------------- determinism --------------------------- */

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Split a blueprint weight across n generated tasks; sums exactly. */
function splitWeight(total: number, n: number): number[] {
  const round6 = (x: number) => Math.round(x * 1e6) / 1e6;
  const per = round6(total / n);
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(round6(total - allocated));
    } else {
      out.push(per);
      allocated = round6(allocated + per);
    }
  }
  return out;
}

/* --------------------------- task building ------------------------- */

interface RawTask {
  id: string;
  assessmentId: string;
  planId: string;
  order: number;
  type: z.infer<typeof TaskBlueprint>['type'];
  title: Record<string, string>;
  brief?: Record<string, string>;
  nosRefs: string[];
  criteriaRefs: string[];
  weight: number;
  criticalSafety: boolean;
  evidenceSpec?: Record<string, unknown>;
  presentedOptions: Array<{ id: string; text: Record<string, string> }>;
  correctIds: string[];
  checklistItems: Array<Record<string, unknown>>;
  /** Mixed subdocs don't get mongoose timestamps — contract Task requires them. */
  createdAt: string;
  updatedAt: string;
}

function deriveChecklist(pack: TradePack, bp: TaskBlueprint): Array<Record<string, unknown>> {
  if (bp.checklistFrom === 'custom' && bp.checklistItems.length > 0) {
    return bp.checklistItems as unknown as Array<Record<string, unknown>>;
  }
  const items: Array<Record<string, unknown>> = [];
  bp.criteriaRefs.forEach((ref, i) => {
    for (const nos of pack.nos) {
      const pc = nos.performanceCriteria.find((p) => p.id === ref);
      if (pc) {
        const item: ChecklistItem = {
          id: `chk-${i + 1}`,
          text: { en: pc.text },
          criterionRef: pc.id,
          criticalSafety: pc.criticalSafety,
        };
        items.push(item as unknown as Record<string, unknown>);
        break;
      }
    }
  });
  if (items.length === 0 && bp.checklistItems.length > 0) {
    return bp.checklistItems as unknown as Array<Record<string, unknown>>;
  }
  return items;
}

function buildTasks(
  pack: TradePack,
  assessmentId: string,
  planId: string,
): RawTask[] {
  const rng = mulberry32(hashStr(`${assessmentId}:v1`));
  const tasks: RawTask[] = [];
  let order = 0;

  const nowIso = new Date().toISOString();
  const base = (bp: TaskBlueprint) => ({
    id: randomUUID(),
    assessmentId,
    planId,
    order: order++,
    type: bp.type,
    title: bp.title as unknown as Record<string, string>,
    brief: bp.brief as unknown as Record<string, string> | undefined,
    nosRefs: bp.nosRefs,
    criteriaRefs: bp.criteriaRefs,
    criticalSafety: bp.criticalSafety,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  for (const bp of pack.taskBlueprints) {
    switch (bp.type) {
      case 'mcq': {
        const items = bp.mcqIds
          .map((id) => pack.mcqBank.find((m) => m.id === id))
          .filter((m): m is NonNullable<typeof m> => Boolean(m));
        if (items.length === 0) {
          throw new Error(`mcq blueprint ${bp.id} references no bank questions`);
        }
        const weights = splitWeight(bp.weight, items.length);
        items.forEach((mcq, i) => {
          const title = { ...bp.title };
          if (items.length > 1) title.en = `${title.en} (${i + 1}/${items.length})`;
          tasks.push({
            ...base(bp),
            title: title as unknown as Record<string, string>,
            weight: weights[i],
            evidenceSpec: undefined,
            presentedOptions: seededShuffle(mcq.options, rng).map((o) => ({
              id: o.id,
              text: o.text as unknown as Record<string, string>,
            })),
            correctIds: [mcq.correctOptionId],
            checklistItems: [],
          });
        });
        break;
      }

      case 'tool_identification': {
        const needCorrect = Math.min(bp.toolPickCount ?? 4, pack.tools.length);
        const needDistractors = Math.min(
          bp.toolDistractorCount,
          Math.max(0, pack.tools.length - needCorrect),
        );
        const shuffled = seededShuffle(pack.tools, rng);
        const correct = shuffled.slice(0, needCorrect);
        const distractors = shuffled.slice(needCorrect, needCorrect + needDistractors);
        tasks.push({
          ...base(bp),
          weight: bp.weight,
          evidenceSpec: undefined,
          presentedOptions: seededShuffle([...correct, ...distractors], rng).map((t) => ({
            id: t.id,
            text: t.name as unknown as Record<string, string>,
          })),
          correctIds: correct.map((t) => t.id),
          checklistItems: [],
        });
        break;
      }

      case 'checklist': {
        tasks.push({
          ...base(bp),
          weight: bp.weight,
          evidenceSpec: undefined,
          presentedOptions: [],
          correctIds: [],
          checklistItems: deriveChecklist(pack, bp),
        });
        break;
      }

      case 'practical_photo':
      case 'practical_video':
      case 'narration': {
        const defaultSpec: Record<string, unknown> =
          bp.type === 'narration'
            ? {
                media: ['audio'],
                minCount: 1,
                maxCount: 3,
                requireGps: true,
                requireWorkerInFrame: false,
                narrationRequired: true,
                minDurationSec: 15,
                maxDurationSec: 180,
              }
            : {
                media: bp.type === 'practical_photo' ? ['photo'] : ['video'],
                minCount: 1,
                maxCount: 5,
                requireGps: true,
                requireWorkerInFrame: true,
                narrationRequired: false,
              };
        tasks.push({
          ...base(bp),
          weight: bp.weight,
          evidenceSpec: (bp.evidenceSpec as unknown as Record<string, undefined>) ?? defaultSpec,
          presentedOptions: [],
          correctIds: [],
          checklistItems: [],
        });
        break;
      }
    }
  }
  return tasks;
}

/** Worker-facing view: answer key removed entirely. */
export function stripAnswerKey(plan: unknown): unknown {
  const p = plan as { tasks?: Array<Record<string, unknown>> };
  if (!p?.tasks) return plan;
  return {
    ...p,
    tasks: p.tasks.map((t) => {
      const { correctIds: _dropped, ...rest } = t;
      return rest;
    }),
  };
}

/* --------------------------- endpoints ----------------------------- */

export async function generatePlan(
  assessmentId: string,
  user: AuthUser,
  input: z.infer<typeof GeneratePlanReq>,
): Promise<{ plan: unknown; created: boolean }> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (assessment.workerId !== user.id) throw notFound('Assessment not found');

  // idempotent replay: a stored plan always replays cleanly, with a repair
  // advance if a previous write crashed between the two steps
  const existing = await AssessmentPlan.findOne({ assessmentId }).lean();
  if (existing) {
    if (assessment.status === 'MAPPED') {
      await Assessment.findOneAndUpdate(
        { _id: assessmentId, status: 'MAPPED' },
        {
          $set: { status: 'PLAN_READY' },
          $push: { statusHistory: { status: 'PLAN_READY', at: new Date(), by: user.id } },
          $inc: { version: 1 },
        },
      );
    }
    return { plan: stripAnswerKey(toApi(existing)), created: false };
  }

  assertTransition(assessment.status, 'PLAN_READY');
  if (assessment.status !== 'MAPPED') {
    throw conflict('invalid_transition', `Plan requires MAPPED (current: ${assessment.status})`);
  }

  // choose pack: explicit → top mapping candidate → single-pack fallback
  let packId = input.tradePackId;
  if (!packId) {
    const match = await QPMatch.findOne({ assessmentId }).lean();
    packId = match?.matches?.length
      ? String((match.matches[0] as { tradePackId?: string }).tradePackId)
      : undefined;
  }
  if (!packId) throw conflict('no_pack_selected', 'No trade pack mapping available for this assessment');

  const pack = await getTradePack(packId); // 404 on unknown pack
  const planId = randomUUID();
  const tasks = buildTasks(pack, assessmentId, planId);
  const totalWeight = tasks.reduce((acc, t) => acc + t.weight, 0);

  const doc = await AssessmentPlan.create({
    _id: planId,
    assessmentId,
    tradePackId: pack.id,
    qpTitle: pack.qp.title,
    nsqfLevel: pack.qp.nsqfLevel,
    tasks: tasks as unknown as Record<string, unknown>[],
    totalWeight: Math.round(totalWeight * 1e6) / 1e6,
    generatedBy: 'rule',
  });

  const advanced = await Assessment.findOneAndUpdate(
    { _id: assessmentId, status: 'MAPPED' },
    {
      $set: { status: 'PLAN_READY' },
      $push: { statusHistory: { status: 'PLAN_READY', at: new Date(), by: user.id } },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!advanced) {
    const race = await AssessmentPlan.findOne({ assessmentId }).lean();
    if (race) return { plan: stripAnswerKey(toApi(race)), created: true };
    throw conflict('invalid_transition', 'Assessment left MAPPED during plan generation');
  }

  return { plan: stripAnswerKey(toApi(doc.toObject())), created: true };
}

export async function getPlanFor(
  assessmentId: string,
  user: AuthUser,
): Promise<{ plan: unknown; stripped: boolean }> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (user.role === 'worker' && assessment.workerId !== user.id) {
    throw notFound('Assessment not found');
  }
  const plan = await AssessmentPlan.findOne({ assessmentId }).lean();
  if (!plan) throw notFound('No plan for this assessment yet');

  const api = toApi(plan);
  // workers never see the answer key; assessors do (review support)
  if (user.role === 'worker') return { plan: stripAnswerKey(api), stripped: true };
  return { plan: api, stripped: false };
}
