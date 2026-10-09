/**
 * Assessor review workflow + final decision.
 *
 *   AI_ANALYZED --claim--> UNDER_REVIEW --submit--> REVIEWED --decision--> APPROVED|REJECTED
 *                                          \--REASSESS--> (round+1) IN_PROGRESS
 *
 * All transitions go through the shared state machine; every step is
 * idempotent so an offline/duplicate tap can't double-apply.
 */
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AIItemScore, ListQuery, ReviewItem, ReviewSubmitReq } from '@sih/contracts';
import { conflict, invalid, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { logger } from '../logger.js';
import { AIAnalysis } from '../models/analysis.models.js';
import { Assessment, AssessmentPlan, newUuid } from '../models/assessment.models.js';
import { AssessorReview, Decision } from '../models/review.models.js';
import { toApi } from '../utils/toApi.js';
import { getAssessmentFor, transitionAssessment } from './assessment.service.js';
import { recordChange } from './changelog.service.js';

/* ------------------------------------------------------------------ */
/* Review claim                                                        */
/* ------------------------------------------------------------------ */

export async function claimReview(assessmentId: string, user: AuthUser): Promise<unknown> {
  const assessment = await getAssessmentFor(assessmentId, user);

  if (assessment.status === 'UNDER_REVIEW') {
    if (assessment.claimedBy && assessment.claimedBy !== user.id) {
      throw conflict('already_claimed', 'This assessment is already being reviewed by another assessor');
    }
    if (!assessment.claimedBy) {
      await Assessment.updateOne({ _id: assessmentId }, { $set: { claimedBy: user.id } });
    }
    const fresh = await Assessment.findById(assessmentId).lean();
    return toApi(fresh ?? assessment.toObject());
  }

  if (assessment.status !== 'AI_ANALYZED') {
    throw conflict(
      'invalid_state',
      `A review can only be claimed once analysis is done (current: ${assessment.status})`,
    );
  }

  const updated = await transitionAssessment(assessmentId, 'UNDER_REVIEW', {
    by: user.id,
    note: 'review claimed',
    set: { claimedBy: user.id },
  });
  return toApi(updated.toObject());
}

/* ------------------------------------------------------------------ */
/* Review submission                                                   */
/* ------------------------------------------------------------------ */

export async function submitReview(
  assessmentId: string,
  user: AuthUser,
  input: z.infer<typeof ReviewSubmitReq>,
): Promise<unknown> {
  const assessment = await getAssessmentFor(assessmentId, user);
  const round = assessment.round;

  // replay: a completed review for this round already exists → return it
  const existing = await AssessorReview.findOne({ assessmentId, round }).lean();
  if (existing) return toApi(existing);

  if (assessment.status !== 'UNDER_REVIEW') {
    throw conflict('invalid_state', `Review requires UNDER_REVIEW (current: ${assessment.status})`);
  }
  if (assessment.claimedBy && assessment.claimedBy !== user.id) {
    throw conflict('not_claimant', 'This assessment is claimed by another assessor');
  }
  if (input.outcome === 'REASSESS' && input.reassessmentTasks.length === 0) {
    throw invalid('reassessmentTasks must name at least one task when outcome is REASSESS');
  }

  const plan = await AssessmentPlan.findOne({ assessmentId }).lean();
  if (!plan) throw conflict('no_plan', 'Cannot review an assessment without a plan');
  const taskIds = new Set(((plan.tasks ?? []) as Array<{ id?: string }>).map((t) => t.id));
  for (const item of input.items) {
    if (!taskIds.has(item.taskId)) throw notFound(`Task not found in this assessment plan: ${item.taskId}`);
  }

  const analysis = await AIAnalysis.findOne({ assessmentId, round }).lean();
  const aiByTask = new Map(((analysis?.items ?? []) as AIItemScore[]).map((i) => [i.taskId, i]));

  const items: ReviewItem[] = input.items.map((item) => {
    const ai = aiByTask.get(item.taskId);
    const aiScore = ai && ai.aiScore !== null && ai.aiScore !== undefined ? ai.aiScore : null;
    const status = item.acceptAi ? 'accepted' : aiScore === null ? 'manual' : 'overridden';
    return {
      taskId: item.taskId,
      aiScore,
      finalScore: item.finalScore,
      status,
      ...(item.comment ? { comment: item.comment } : {}),
    };
  });

  const now = new Date();
  const doc = await AssessorReview.findOneAndUpdate(
    { assessmentId, round },
    {
      $set: {
        assessorId: user.id,
        items,
        outcome: input.outcome,
        reassessmentTasks: input.reassessmentTasks,
        completedAt: now,
        ...(input.overallComment ? { overallComment: input.overallComment } : {}),
      },
      $setOnInsert: { _id: randomUUID(), assessmentId, round, startedAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (input.outcome === 'REVIEWED') {
    await transitionAssessment(assessmentId, 'REVIEWED', { by: user.id, note: 'review completed' });
  } else {
    await transitionAssessment(assessmentId, 'REASSESS', {
      by: user.id,
      note: 'reassessment requested',
      set: { claimedBy: null },
    });
    // token the round so new answers/evidence/analysis are scoped separately
    await Assessment.updateOne({ _id: assessmentId }, { $inc: { round: 1 } });
    logger.info({ assessmentId, round: round + 1 }, 'assessment moved to reassessment round');
  }

  await recordChange({
    entity: 'review',
    id: String(doc._id),
    ownerId: assessment.workerId,
    updatedAt: now,
    data: toApi(doc.toObject()),
  });
  return toApi(doc.toObject());
}

export async function getReviewFor(assessmentId: string, user: AuthUser): Promise<unknown> {
  await getAssessmentFor(assessmentId, user);
  const doc = await AssessorReview.findOne({ assessmentId }).sort({ round: -1, completedAt: -1 }).lean();
  if (!doc) throw notFound('No review available for this assessment yet');
  return toApi(doc);
}

/* ------------------------------------------------------------------ */
/* Assessor queue                                                      */
/* ------------------------------------------------------------------ */

const QUEUE_STATUSES = ['AI_ANALYZED', 'UNDER_REVIEW'] as const;

export async function assessorQueue(user: AuthUser, query: z.infer<typeof ListQuery>) {
  void user; // any assessor may see the shared queue
  const filter = { status: { $in: [...QUEUE_STATUSES] } };
  const [items, total] = await Promise.all([
    Assessment.find(filter)
      .sort({ updatedAt: 1, _id: 1 }) // oldest first → fair
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Assessment.countDocuments(filter),
  ]);
  return { items: items.map(toApi), page: query.page, limit: query.limit, total };
}

/* ------------------------------------------------------------------ */
/* Final decision                                                      */
/* ------------------------------------------------------------------ */

export async function submitDecision(
  assessmentId: string,
  user: AuthUser,
  input: { outcome: 'APPROVED' | 'REJECTED'; comments?: string },
): Promise<unknown> {
  const assessment = await getAssessmentFor(assessmentId, user);

  const existing = await Decision.findOne({ assessmentId }).lean();
  if (existing) return toApi(existing); // replay

  if (assessment.status !== 'REVIEWED') {
    throw conflict('invalid_state', `A decision requires REVIEWED (current: ${assessment.status})`);
  }

  await transitionAssessment(assessmentId, input.outcome, {
    by: user.id,
    note: input.comments ?? `decision: ${input.outcome}`,
  });

  const now = new Date();
  const doc = await Decision.create({
    _id: newUuid(),
    assessmentId,
    outcome: input.outcome,
    authorizedAssessorId: user.id,
    ...(input.comments ? { comments: input.comments } : {}),
    issuedAt: now,
  });

  await recordChange({
    entity: 'decision',
    id: doc._id,
    ownerId: assessment.workerId,
    updatedAt: now,
    data: toApi(doc.toObject()),
  });
  return toApi(doc.toObject());
}

export async function getDecisionFor(assessmentId: string, user: AuthUser): Promise<unknown> {
  await getAssessmentFor(assessmentId, user);
  const doc = await Decision.findOne({ assessmentId }).lean();
  if (!doc) throw notFound('No decision recorded for this assessment yet');
  return toApi(doc);
}
