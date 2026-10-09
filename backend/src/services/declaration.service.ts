/**
 * Self-declaration service.
 *
 * The declaration is written once: replays (offline retry after a lost
 * response) return the stored declaration, and status only advances
 * DRAFT → DECLARED exactly once via the shared state machine.
 */
import type { z } from 'zod';
import type { SubmitDeclarationReq } from '@sih/contracts';
import { conflict, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { Assessment, Declaration, newUuid } from '../models/assessment.models.js';
import { toApi } from '../utils/toApi.js';
import { assertTransition } from './stateMachine.js';
import { recordChange } from './changelog.service.js';
import { onStatusChanged } from './statusEvents.js';

export async function getDeclarationFor(id: string, user: AuthUser): Promise<unknown> {
  const assessment = await Assessment.findById(id);
  if (!assessment) throw notFound('Assessment not found');
  if (user.role === 'worker' && assessment.workerId !== user.id) {
    throw notFound('Assessment not found');
  }
  const declaration = await Declaration.findOne({ assessmentId: id }).lean();
  if (!declaration) throw notFound('Declaration not found');
  return toApi(declaration);
}

export async function submitDeclaration(
  assessmentId: string,
  user: AuthUser,
  input: z.infer<typeof SubmitDeclarationReq>,
): Promise<{ declaration: unknown; created: boolean }> {
  const assessment = await Assessment.findById(assessmentId);
  if (!assessment) throw notFound('Assessment not found');
  if (assessment.workerId !== user.id) throw notFound('Assessment not found');

  // already submitted → idempotent replay (offline sync may re-push)
  const existing = await Declaration.findOne({ assessmentId }).lean();
  if (existing) return { declaration: toApi(existing), created: false };

  assertTransition(assessment.status, 'DECLARED');
  if (assessment.status !== 'DRAFT') {
    throw conflict(
      'invalid_transition',
      `Declarations can only be submitted from DRAFT (current: ${assessment.status})`,
    );
  }

  // advance first (conditional on DRAFT, so only one writer wins)…
  const advanced = await Assessment.findOneAndUpdate(
    { _id: assessmentId, status: 'DRAFT' },
    {
      $set: { status: 'DECLARED' },
      $push: {
        statusHistory: { status: 'DECLARED', at: new Date(), by: user.id },
      },
      $inc: { version: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!advanced) throw conflict('invalid_transition', 'Assessment already left DRAFT');
  await recordChange({
    entity: 'assessment',
    id: assessmentId,
    ownerId: assessment.workerId,
    version: advanced.version,
    updatedAt: advanced.updatedAt,
    data: advanced.toObject(),
  });
  await onStatusChanged({
    assessmentId,
    from: 'DRAFT',
    to: 'DECLARED',
    workerId: assessment.workerId,
    version: advanced.version,
    round: advanced.round,
    actorId: user.id,
    actorRole: user.role,
  });

  // …then persist the declaration; a concurrent duplicate falls through to
  // the stored one (unique index on assessmentId).
  try {
    const doc = await Declaration.create({
      _id: newUuid(),
      assessmentId,
      workerId: user.id,
      language: input.language,
      answers: input.answers,
      voiceAnswers: input.voiceAnswers,
      version: 1,
      clientUpdatedAt: input.clientUpdatedAt ? new Date(input.clientUpdatedAt) : undefined,
      submittedAt: new Date(),
    });
    await recordChange({
      entity: 'declaration',
      id: String(doc._id),
      ownerId: user.id,
      version: 1,
      updatedAt: doc.createdAt,
      data: doc.toObject(),
    });
    return { declaration: toApi(doc.toObject()), created: true };
  } catch (err) {
    const raceWinner = await Declaration.findOne({ assessmentId }).lean();
    if (raceWinner) return { declaration: toApi(raceWinner), created: false };
    throw err;
  }
}
