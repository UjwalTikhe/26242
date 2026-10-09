/**
 * Offline sync engine.
 *
 * push: applies queued ops (profile / declaration / answers) with
 *  - idempotency: replaying a processed key returns the memoized result
 *    ('applied'/'duplicate'/'conflict' are memoized; 'rejected'/'error' are
 *    NOT — a client that fixes a bad payload may legitimately retry);
 *  - LWW via the underlying services (profile.version / clientUpdatedAt);
 *  - per-op isolation: one bad op never poisons the rest of the batch.
 *
 * pull: ObjectId change-feed cursor over SyncChange, scoped to the worker.
 */
import { z } from 'zod';
import { SubmitAnswersReq, SubmitDeclarationReq, UpdateProfileReq, Id } from '@sih/contracts';
import type { SyncPullQuery, SyncPushReq } from '@sih/contracts';
import { Types } from 'mongoose';
import { AppError, badRequest } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { logger } from '../logger.js';
import { IdempotencyLog, SyncChange, type IdempotentStatus } from '../models/sync.models.js';
import { toApi } from '../utils/toApi.js';
import { saveTaskResponse } from './answers.service.js';
import { submitDeclaration } from './declaration.service.js';
import { updateProfile } from './profile.service.js';

type PushOp = z.infer<typeof SyncPushReq>['ops'][number];
type OpStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'error';

interface OpResult {
  opId: string;
  status: OpStatus;
  serverVersion?: number;
  message?: string;
}

/** Payloads arrive as z.unknown() — re-validate here (422 → 'rejected'). */
function parseOrReject<T>(schema: z.ZodType<T>, data: unknown, what: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(422, 'invalid_payload', `Invalid ${what} payload`, result.error.issues);
  }
  return result.data;
}

const versionOf = (value: unknown): number | undefined => {
  const v = (value as { version?: unknown } | null | undefined)?.version;
  return typeof v === 'number' ? v : undefined;
};

/* ------------------------------------------------------------------ */
/* Op dispatch                                                         */
/* ------------------------------------------------------------------ */

const DeclarationPushPayload = SubmitDeclarationReq.extend({ assessmentId: Id });
const AnswersPushPayload = SubmitAnswersReq.extend({ assessmentId: Id });

async function applyOp(user: AuthUser, op: PushOp): Promise<OpResult> {
  try {
    switch (op.entity) {
      case 'profile': {
        const payload = parseOrReject(UpdateProfileReq, op.payload, 'profile');
        const res = await updateProfile(user.id, payload);
        if (res.ok) return { opId: op.opId, status: 'applied', serverVersion: versionOf(res.profile) };
        return { opId: op.opId, status: 'conflict', serverVersion: versionOf(res.server), message: res.message };
      }
      case 'declaration': {
        const payload = parseOrReject(DeclarationPushPayload, op.payload, 'declaration');
        const { declaration, created } = await submitDeclaration(payload.assessmentId, user, payload);
        return {
          opId: op.opId,
          status: created ? 'applied' : 'duplicate',
          serverVersion: versionOf(declaration),
        };
      }
      case 'answers': {
        const payload = parseOrReject(AnswersPushPayload, op.payload, 'answers');
        const res = await saveTaskResponse(user, payload.assessmentId, {
          taskId: payload.taskId,
          answers: payload.answers,
          clientUpdatedAt: payload.clientUpdatedAt ?? op.clientUpdatedAt,
        });
        if (!res.applied) {
          return { opId: op.opId, status: 'conflict', message: 'A newer response for this task exists on the server' };
        }
        return { opId: op.opId, status: res.changed ? 'applied' : 'duplicate' };
      }
      default: {
        const never: never = op.entity;
        return { opId: op.opId, status: 'rejected', message: `Unknown entity: ${String(never)}` };
      }
    }
  } catch (err) {
    if (err instanceof AppError) {
      if (err.status === 409) return { opId: op.opId, status: 'conflict', message: err.message };
      if (err.status >= 400 && err.status < 500) return { opId: op.opId, status: 'rejected', message: err.message };
      logger.error({ err, opId: op.opId, entity: op.entity }, 'sync op server error');
      return { opId: op.opId, status: 'error', message: err.message };
    }
    logger.error({ err, opId: op.opId, entity: op.entity }, 'sync op failed');
    return { opId: op.opId, status: 'error', message: 'Internal error while applying op' };
  }
}

/** Outcomes worth memoizing — retryable ones (rejected/error) stay unlogged. */
const MEMOIZED: ReadonlySet<OpStatus> = new Set<OpStatus>(['applied', 'duplicate', 'conflict']);

/**
 * A replay of a memoized op performs no new write now, so it reports
 * 'duplicate' regardless of the stored outcome — except a stored 'conflict',
 * which stays a conflict (retrying would lose again). Keeps the invariant
 * "'applied' means THIS call changed state".
 */
const replayOf = (stored: IdempotentStatus): OpStatus => (stored === 'applied' ? 'duplicate' : stored);

async function remember(ownerId: string, op: PushOp, result: OpResult): Promise<void> {
  if (!MEMOIZED.has(result.status)) return;
  try {
    await IdempotencyLog.create({
      opId: op.opId,
      ownerId,
      idempotencyKey: op.idempotencyKey,
      entity: op.entity,
      action: op.action,
      status: result.status,
      serverVersion: result.serverVersion,
      message: result.message,
      appliedAt: new Date(),
    });
  } catch (err) {
    // unique-key race: another request memoized first — surface ITS result
    if (Number((err as { code?: unknown }).code) === 11000) {
      const prior = await IdempotencyLog.findOne({ ownerId, idempotencyKey: op.idempotencyKey }).lean();
      if (prior) {
        Object.assign(result, {
          status: replayOf(prior.status),
          serverVersion: prior.serverVersion,
          message: prior.message,
        });
        return;
      }
    }
    logger.error({ err, opId: op.opId }, 'idempotency memo write failed');
  }
}

/* ------------------------------------------------------------------ */
/* Push                                                                */
/* ------------------------------------------------------------------ */

export async function pushOps(
  user: AuthUser,
  body: z.infer<typeof SyncPushReq>,
): Promise<{ results: OpResult[]; serverTime: string }> {
  const results: OpResult[] = [];

  for (const op of body.ops) {
    // 1. replay? → memoized result, no re-apply
    const prior = await IdempotencyLog.findOne({
      ownerId: user.id,
      idempotencyKey: op.idempotencyKey,
    }).lean();
    if (prior) {
      results.push({
        opId: op.opId,
        status: replayOf(prior.status),
        serverVersion: prior.serverVersion,
        message: prior.status === 'applied' ? 'Already processed — idempotent replay' : prior.message,
      });
      continue;
    }

    // 2. apply (per-op isolation)
    const result = await applyOp(user, op);

    // 3. memoize durable outcomes so a lost response replays cleanly
    await remember(user.id, op, result);
    results.push(result);
  }

  return { results, serverTime: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Pull                                                                */
/* ------------------------------------------------------------------ */

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export async function pullChanges(
  user: AuthUser,
  query: z.infer<typeof SyncPullQuery>,
): Promise<{
  changes: Array<{ entity: string; id: string; version?: number; updatedAt: string; deleted: boolean; data?: unknown }>;
  nextCursor?: string;
  hasMore: boolean;
  serverTime: string;
}> {
  const filter: Record<string, unknown> = { ownerId: user.id };
  if (query.cursor) {
    if (!OBJECT_ID.test(query.cursor)) {
      throw badRequest('invalid_cursor', 'cursor must be a change-feed id (24 hex chars)');
    }
    filter._id = { $gt: new Types.ObjectId(query.cursor) };
  }

  const docs = await SyncChange.find(filter)
    .sort({ _id: 1 })
    .limit(query.limit + 1)
    .lean();

  const hasMore = docs.length > query.limit;
  const page = hasMore ? docs.slice(0, query.limit) : docs;
  const last = page[page.length - 1];

  return {
    changes: page.map((d) => ({
      entity: d.entity,
      id: d.id,
      version: d.version,
      updatedAt: toApi(d.updatedAt) as string,
      deleted: d.deleted,
      data: d.data,
    })),
    // always advance when there is progress — re-pulling an old cursor is
    // idempotent but wasteful; hasMore tells the client whether to loop
    nextCursor: last ? String(last._id) : undefined,
    hasMore,
    serverTime: new Date().toISOString(),
  };
}
