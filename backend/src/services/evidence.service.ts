/**
 * Evidence service — append-only artifact registration.
 *
 * Two creation paths share `createEvidenceRecord`:
 *  1. tus upload finish  → bytes already staged at `tus/<uploadId>`
 *  2. JSON POST register → client points at an existing storageKey
 *
 * Both dedupe on storageKey, hash server-side (streaming SHA-256), verify an
 * optional device hash, and link records into a per-assessment hash chain
 * (chainPrev → chainHash) under an in-process mutex so the chain never forks
 * within a process. `seq` appends within (assessment, task, round) behind a
 * unique index as a second line of defence.
 */
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import { Evidence as EvidenceSchema, PageQuery, RegisterEvidenceReq, WORKER_WRITABLE_STATUSES } from '@sih/contracts';
import { conflict, invalid, notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { AssessmentPlan, newUuid } from '../models/assessment.models.js';
import { Evidence } from '../models/evidence.models.js';
import { getStorage } from '../storage/index.js';
import { toApi } from '../utils/toApi.js';
import { getAssessmentFor } from './assessment.service.js';
import { recordChange } from './changelog.service.js';

type RegisterInput = z.infer<typeof RegisterEvidenceReq>;

/* ------------------------------------------------------------------ */
/* Per-assessment append lock (hash chain must not fork)               */
/* ------------------------------------------------------------------ */

const chainLocks = new Map<string, Promise<void>>();

async function withChainLock<T>(assessmentId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chainLocks.get(assessmentId) ?? Promise.resolve();
  const run: Promise<T> = prev.then(fn);
  const tail: Promise<void> = run.then(
    () => undefined,
    () => undefined,
  );
  chainLocks.set(assessmentId, tail);
  try {
    return await run;
  } finally {
    if (chainLocks.get(assessmentId) === tail) chainLocks.delete(assessmentId);
  }
}

/* ------------------------------------------------------------------ */
/* Create (shared by tus finish + JSON register)                       */
/* ------------------------------------------------------------------ */

export interface CreateEvidenceArgs {
  assessmentId: string;
  workerId: string;
  round: number;
  taskId?: string;
  kind: RegisterInput['kind'];
  storageKey: string;
  mimeType?: string;
  capturedAt: string;
  clientSha256?: string;
  deviceId?: string;
  appVersion?: string;
  gps?: { lat: number; lng: number; accuracy?: number; source?: 'gps' | 'network' | 'manual' };
  language?: RegisterInput['language'];
  narrationText?: string;
  narrationSource?: 'asr' | 'client';
}

export async function createEvidenceRecord(
  args: CreateEvidenceArgs,
): Promise<{ evidence: unknown; created: boolean }> {
  const storage = getStorage();

  // fast-path dedupe (double finish vs register race) — re-checked inside the lock
  const existing = await Evidence.findOne({ storageKey: args.storageKey }).lean();
  if (existing) return { evidence: EvidenceSchema.parse(toApi(existing)), created: false };

  // bytes must exist before we claim integrity over them
  if (!(await storage.exists(args.storageKey))) {
    throw notFound('Uploaded bytes for storageKey not found — complete the upload first');
  }
  const serverSha256 = await storage.sha256(args.storageKey);
  const { sizeBytes } = await storage.stat(args.storageKey);
  const hashVerified = args.clientSha256 ? args.clientSha256 === serverSha256 : false;

  return withChainLock(args.assessmentId, async () => {
    const dup = await Evidence.findOne({ storageKey: args.storageKey }).lean();
    if (dup) return { evidence: EvidenceSchema.parse(toApi(dup)), created: false };

    const scopeFilter = {
      assessmentId: args.assessmentId,
      taskId: args.taskId ?? null,
      round: args.round,
    };
    const seq = await Evidence.countDocuments(scopeFilter);

    const last = await Evidence.findOne({ assessmentId: args.assessmentId })
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    const chainPrev = last?.integrity?.chainHash;

    const id = newUuid();
    const chainHash = createHash('sha256')
      .update(`${chainPrev ?? ''}|${serverSha256}|${id}`)
      .digest('hex');

    const doc = await Evidence.create({
      _id: id,
      assessmentId: args.assessmentId,
      taskId: args.taskId,
      workerId: args.workerId,
      round: args.round,
      seq,
      kind: args.kind,
      storageKey: args.storageKey,
      sizeBytes,
      mimeType: args.mimeType,
      capturedAt: new Date(args.capturedAt),
      deviceId: args.deviceId,
      appVersion: args.appVersion,
      gps: args.gps,
      language: args.language,
      narration: args.narrationText
        ? {
            text: args.narrationText,
            language: args.language,
            source: args.narrationSource ?? 'client',
            confirmed: false,
          }
        : undefined,
      status: 'received',
      integrity: {
        serverSha256,
        clientSha256: args.clientSha256,
        hashVerified,
        chainPrev,
        chainHash,
      },
    });

    const api = toApi(doc.toObject());
    await recordChange({
      entity: 'evidence',
      id,
      ownerId: args.workerId,
      updatedAt: doc.createdAt,
      data: api,
    });
    return { evidence: EvidenceSchema.parse(api), created: true };
  });
}

/* ------------------------------------------------------------------ */
/* JSON registration route                                             */
/* ------------------------------------------------------------------ */

export async function registerEvidence(
  assessmentId: string,
  user: AuthUser,
  input: RegisterInput,
): Promise<{ evidence: unknown; created: boolean }> {
  const assessment = await getAssessmentFor(assessmentId, user);
  if (!(WORKER_WRITABLE_STATUSES as readonly string[]).includes(assessment.status)) {
    throw conflict(
      'assessment_locked',
      `Evidence can only be added while the assessment is writable (current: ${assessment.status})`,
    );
  }

  // no bytes in this request — the client must upload first (tus) and pass
  // the storage key back; a metadata-only record would fake its integrity.
  if (!input.storageKey) {
    throw invalid(
      'storageKey required: upload bytes via POST /api/v1/files first, then register with the returned key',
    );
  }

  // throws 400 on traversal, 404 when the upload never completed
  if (!(await getStorage().exists(input.storageKey))) {
    throw notFound('Uploaded bytes for storageKey not found — complete the upload first');
  }

  let taskId = input.taskId;
  if (input.taskId) {
    const plan = await AssessmentPlan.findOne({ assessmentId }).lean();
    if (plan) {
      const tasks = (plan.tasks ?? []) as Array<{ id?: string }>;
      if (!tasks.some((t) => t.id === input.taskId)) throw notFound('Task not found in this assessment plan');
      taskId = input.taskId;
    }
    // no plan yet (pre-generation registration): keep the reference as sent
  }

  return createEvidenceRecord({
    assessmentId,
    workerId: assessment.workerId,
    round: assessment.round,
    taskId,
    kind: input.kind,
    storageKey: input.storageKey,
    mimeType: input.mimeType,
    capturedAt: input.capturedAt,
    clientSha256: input.clientSha256,
    deviceId: input.deviceId,
    appVersion: input.appVersion,
    gps: input.gps,
    language: input.language,
    narrationText: input.narrationText,
    narrationSource: input.narrationSource,
  });
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export async function listEvidence(
  assessmentId: string,
  user: AuthUser,
  query: z.infer<typeof PageQuery>,
) {
  await getAssessmentFor(assessmentId, user);
  const filter = { assessmentId };
  const [items, total] = await Promise.all([
    Evidence.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Evidence.countDocuments(filter),
  ]);
  return {
    items: items.map((i) => EvidenceSchema.parse(toApi(i))),
    page: query.page,
    limit: query.limit,
    total,
  };
}
