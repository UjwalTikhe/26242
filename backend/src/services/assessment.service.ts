/**
 * Assessment service: creation (idempotent via client UUID), role-scoped
 * reads, and the guarded status transition used by every workflow step.
 */
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AssessmentStatus, CreateAssessmentReq, ListQuery } from '@sih/contracts';
import { conflict, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { Assessment, type AssessmentDoc, type AssessmentDocument } from '../models/assessment.models.js';
import { toApi } from '../utils/toApi.js';
import { assertTransition } from './stateMachine.js';
import { recordChange } from './changelog.service.js';

/** Workers see only their own; assessors see everything (404 hides existence). */
export async function getAssessmentFor(id: string, user: AuthUser): Promise<AssessmentDocument> {
  const doc = await Assessment.findById(id);
  if (!doc) throw notFound('Assessment not found');
  if (user.role === 'worker' && doc.workerId !== user.id) throw notFound('Assessment not found');
  return doc;
}

export async function createAssessment(
  workerId: string,
  input: z.infer<typeof CreateAssessmentReq>,
): Promise<{ assessment: unknown; created: boolean }> {
  const id = input.id ?? randomUUID();

  const existing = await Assessment.findById(id);
  if (existing) {
    // offline replay: same client UUID from the same worker → same assessment
    if (existing.workerId !== workerId) {
      throw conflict('id_taken', 'An assessment with this id already exists');
    }
    return { assessment: toApi(existing.toObject()), created: false };
  }

  const now = new Date();
  const doc = await Assessment.create({
    _id: id,
    workerId,
    status: 'DRAFT',
    round: 1,
    language: input.language,
    version: 0,
    statusHistory: [{ status: 'DRAFT', at: now, by: workerId }],
    tradeHint: input.tradeHint,
  });
  await recordChange({
    entity: 'assessment',
    id,
    ownerId: workerId,
    version: 0,
    updatedAt: doc.createdAt,
    data: doc.toObject(),
  });
  return { assessment: toApi(doc.toObject()), created: true };
}

export async function listAssessments(user: AuthUser, query: z.infer<typeof ListQuery>) {
  const filter: Record<string, unknown> = {};
  if (user.role === 'worker') filter.workerId = user.id;
  else if (query.workerId) filter.workerId = query.workerId; // workers can't probe others
  if (query.status) filter.status = query.status;

  const page = query.page;
  const limit = query.limit;
  const [items, total] = await Promise.all([
    Assessment.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Assessment.countDocuments(filter),
  ]);
  return { items: items.map(toApi), page, limit, total };
}

/**
 * Guarded transition: validates against the shared table, appends a status
 * event, bumps the version (sync cursor feed), and is idempotent when the
 * assessment is already at the target status (offline replay).
 */
export async function transitionAssessment(
  id: string,
  to: AssessmentStatus,
  opts: { by?: string; note?: string } = {},
): Promise<AssessmentDocument> {
  const doc = await Assessment.findById(id);
  if (!doc) throw notFound('Assessment not found');
  const from = doc.status;
  assertTransition(from, to);
  if (from === to) return doc; // idempotent no-op

  const updated = await Assessment.findOneAndUpdate(
    { _id: id, status: from },
    {
      $set: { status: to },
      $push: { statusHistory: { status: to, at: new Date(), ...(opts.by ? { by: opts.by } : {}), ...(opts.note ? { note: opts.note } : {}) } },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!updated) {
    // lost a race — re-read and re-validate so the caller gets a clean answer
    const latest = await Assessment.findById(id);
    if (!latest) throw notFound('Assessment not found');
    assertTransition(latest.status, to);
    return latest;
  }
  await recordChange({
    entity: 'assessment',
    id,
    ownerId: updated.workerId,
    version: updated.version,
    updatedAt: updated.updatedAt,
    data: updated.toObject(),
  });
  return updated;
}

/** Fetch an assessment the current user is allowed to see, or throw 404. */
export async function getAssessmentForUser(id: string, user: AuthUser): Promise<unknown> {
  return toApi((await getAssessmentFor(id, user)).toObject());
}
