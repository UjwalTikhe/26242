/**
 * Task answers service (offline-first LWW storage).
 *
 * Phase 3 scope: validate + store responses with last-write-wins semantics
 * keyed on clientUpdatedAt, so offline edits and sync replays converge.
 * Deterministic auto-scoring (answer key) and the SUBMITTED transition are
 * Phase 5 — this module keeps `autoScore` unset/removed when answers change
 * so a stale score can never outlive the answers it graded.
 */
import type { z } from 'zod';
import { TaskAnswers, TaskResponse, WORKER_WRITABLE_STATUSES, type PageQuery } from '@sih/contracts';
import { conflict, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { AssessmentPlan, TaskResponse as TaskResponseModel, newUuid } from '../models/assessment.models.js';
import { toApi } from '../utils/toApi.js';
import { stableStringify } from '../utils/stableStringify.js';
import { getAssessmentFor } from './assessment.service.js';
import { recordChange } from './changelog.service.js';

export interface SaveTaskResponseResult {
  response: unknown;
  assessment: unknown;
  /** No prior response existed for (assessment, task, round). */
  created: boolean;
  /** LWW accepted the incoming write (false = server copy is newer). */
  applied: boolean;
  /** Answers content actually changed (false = idempotent replay). */
  changed: boolean;
}

export async function saveTaskResponse(
  user: AuthUser,
  assessmentId: string,
  input: { taskId: string; answers: z.infer<typeof TaskAnswers>; clientUpdatedAt?: string },
): Promise<SaveTaskResponseResult> {
  const assessment = await getAssessmentFor(assessmentId, user);
  if (assessment.workerId !== user.id) throw notFound('Assessment not found'); // writers are owners
  if (!(WORKER_WRITABLE_STATUSES as readonly string[]).includes(assessment.status)) {
    throw conflict(
      'assessment_locked',
      `Answers can only be changed while the assessment is writable (current: ${assessment.status})`,
    );
  }

  const plan = await AssessmentPlan.findOne({ assessmentId }).lean();
  if (!plan) throw notFound('Assessment plan not found — generate the plan before answering');
  const tasks = (plan.tasks ?? []) as Array<{ id?: string }>;
  if (!tasks.some((t) => t.id === input.taskId)) throw notFound('Task not found in this assessment plan');

  const round = assessment.round;
  const incomingAt = input.clientUpdatedAt ? new Date(input.clientUpdatedAt).getTime() : Date.now();

  const existing = await TaskResponseModel.findOne({ assessmentId, taskId: input.taskId, round }).lean();

  if (existing) {
    const serverAt = existing.clientUpdatedAt?.getTime() ?? 0;
    if (incomingAt < serverAt) {
      // stale write — server copy wins (LWW); caller reports 'conflict'
      return {
        response: TaskResponse.parse(toApi(existing)),
        assessment: toApi(assessment.toObject()),
        created: false,
        applied: false,
        changed: false,
      };
    }
    if (stableStringify(existing.answers) === stableStringify(input.answers)) {
      // identical content (offline replay) — nothing to write, keep any score
      return {
        response: TaskResponse.parse(toApi(existing)),
        assessment: toApi(assessment.toObject()),
        created: false,
        applied: true,
        changed: false,
      };
    }
  }

  const at = new Date(input.clientUpdatedAt ?? Date.now());
  // upsert: filter equality fields (assessmentId, taskId, round) are copied
  // into the inserted doc — only _id + workerId need $setOnInsert (never the
  // same path twice: MongoDB rejects conflicting operators).
  const doc = await TaskResponseModel.findOneAndUpdate(
    { assessmentId, taskId: input.taskId, round },
    {
      $set: { answers: input.answers, clientUpdatedAt: at },
      // answers changed → any previous auto-score is stale
      $unset: { autoScore: '' },
      $setOnInsert: { _id: newUuid(), workerId: user.id },
    },
    { upsert: true, returnDocument: 'after' },
  );

  const api = toApi(doc.toObject());
  await recordChange({
    entity: 'answers',
    id: String(api.id),
    ownerId: user.id,
    updatedAt: new Date(api.updatedAt),
    data: api,
  });

  return {
    response: TaskResponse.parse(api),
    assessment: toApi(assessment.toObject()),
    created: !existing,
    applied: true,
    changed: true,
  };
}

export async function listTaskResponses(
  assessmentId: string,
  user: AuthUser,
  _query?: z.infer<typeof PageQuery>,
): Promise<{ items: unknown[] }> {
  await getAssessmentFor(assessmentId, user);
  const items = await TaskResponseModel.find({ assessmentId }).sort({ createdAt: 1, _id: 1 }).lean();
  return { items: items.map((i) => TaskResponse.parse(toApi(i))) };
}
