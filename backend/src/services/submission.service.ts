/**
 * Worker submission: IN_PROGRESS → SUBMITTED, then queue the AI pipeline.
 *
 * Idempotent (offline replay): a second submit of an already-submitted
 * assessment re-queues analysis if it never ran, otherwise returns the current
 * record unchanged.
 */
import { notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { Assessment } from '../models/assessment.models.js';
import { toApi } from '../utils/toApi.js';
import { transitionAssessment } from './assessment.service.js';
import { enqueueAnalysis } from '../queue/analysis.queue.js';

const SUBMITTED_OR_BEYOND = new Set([
  'SUBMITTED',
  'AI_ANALYZED',
  'UNDER_REVIEW',
  'REASSESS',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
]);

export async function submitAssessment(assessmentId: string, user: AuthUser): Promise<unknown> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (assessment.workerId !== user.id) throw notFound('Assessment not found');

  if (assessment.status === 'SUBMITTED') {
    // replay after a lost response / crashed analysis — safe to re-queue
    await enqueueAnalysis(assessmentId);
    const fresh = await Assessment.findById(assessmentId).lean();
    return toApi(fresh ?? assessment.toObject());
  }
  if (SUBMITTED_OR_BEYOND.has(assessment.status)) {
    return toApi(assessment.toObject());
  }

  const updated = await transitionAssessment(assessmentId, 'SUBMITTED', {
    by: user.id,
    note: 'worker submitted',
  });
  const snapshot = toApi(updated.toObject());
  await enqueueAnalysis(assessmentId);
  return snapshot;
}
