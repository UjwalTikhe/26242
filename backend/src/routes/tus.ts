/**
 * tus resumable uploads (`/api/v1/files`) — byte transport for evidence.
 *
 * Seam design (Phase 3):
 *  - Express guard runs first (`authGuard('worker')`), then carries the
 *    verified JWT identity to the tus hooks through an AsyncLocalStorage —
 *    it never travels on the wire, so it can't be spoofed or lost to
 *    header-caching in the srvx request wrapper.
 *  - `TUS_UPLOAD_DIR` must live inside `LOCAL_STORAGE_DIR` (validated at
 *    boot) so an upload id maps to the storage-driver key `tus/<id>`.
 *  - `onUploadCreate`: Zod-validates evidence metadata, re-checks assessment
 *    ownership + worker-writable status, server-forces `workerId`.
 *  - `onUploadFinish`: re-validates, then creates the Evidence record through
 *    the shared `createEvidenceRecord` (hash chain, seq, dedupe) — the same
 *    path the JSON register route uses.
 *  - `onIncomingRequest`: id-addressed verbs (HEAD/PATCH/GET/DELETE) must be
 *    the upload's owner; anything else is 401/403 before bytes move.
 */
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Express } from 'express';
import { FileStore } from '@tus/file-store';
import { Server as TusServer } from '@tus/server';
import { DateTime, Id, LANGUAGES, MEDIA_TYPES, WORKER_WRITABLE_STATUSES } from '@sih/contracts';
import { z } from 'zod';
import type { AuthUser } from '../auth/jwt.js';
import { env } from '../config/env.js';
import { AppError } from '../errors.js';
import { authGuard } from '../middleware/auth.js';
import type { AssessmentDocument } from '../models/assessment.models.js';
import { getAssessmentFor } from '../services/assessment.service.js';
import { createEvidenceRecord } from '../services/evidence.service.js';

const TUS_PATH = '/api/v1/files';

/* ------------------------------------------------------------------ */
/* Hook aborts: tus maps `status_code` + `body` straight to the reply  */
/* ------------------------------------------------------------------ */

class TusAbort extends Error {
  readonly status_code: number;
  readonly body: string;

  constructor(status_code: number, code: string, message: string) {
    super(message);
    this.status_code = status_code;
    this.body = JSON.stringify({ error: code, message });
  }
}

/** AppError → tus abort; anything else propagates (tus answers 500). */
function toAbort(err: unknown): unknown {
  if (err instanceof TusAbort) return err;
  if (err instanceof AppError) return new TusAbort(err.status, err.code, err.message);
  return err;
}

/**
 * Per-request identity for the tus hooks. `wrap` enters the store around
 * `server.handle()`; every hook in that request's async tree reads it. The
 * store is server-side only — nothing is written to request headers, so a
 * client-supplied `x-user-id` can never reach the hooks.
 */
const identityStore = new AsyncLocalStorage<string>();

function currentUserId(): string {
  const id = identityStore.getStore();
  if (!id) throw new TusAbort(401, 'unauthorized', 'Authentication required');
  return id;
}

/* ------------------------------------------------------------------ */
/* Metadata validation                                                 */
/* ------------------------------------------------------------------ */

const UploadMetadata = z.object({
  assessmentId: Id,
  taskId: Id.optional(),
  kind: z.enum(MEDIA_TYPES),
  capturedAt: DateTime,
  clientSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deviceId: z.string().max(200).optional(),
  appVersion: z.string().max(50).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  accuracy: z.coerce.number().min(0).optional(),
  language: z.enum(LANGUAGES).optional(),
  mimeType: z.string().max(255).optional(),
  narrationText: z.string().max(5000).optional(),
  narrationSource: z.enum(['asr', 'client']).optional(),
});
type UploadMetadata = z.infer<typeof UploadMetadata>;

const METADATA_KEYS = Object.keys(UploadMetadata.shape);

/**
 * tus metadata values arrive as decoded strings (null for value-less keys).
 * Unknown keys are stripped; missing/invalid required keys abort with 422.
 */
function parseUploadMetadata(raw: Record<string, unknown> | undefined): UploadMetadata {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (v !== null && v !== undefined && v !== '') cleaned[k] = v;
  }
  const parsed = UploadMetadata.safeParse(cleaned);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'metadata'}: ${i.message}`)
      .join('; ');
    throw new TusAbort(422, 'invalid_upload_metadata', `Invalid upload metadata — ${detail}`);
  }
  if ((parsed.data.lat === undefined) !== (parsed.data.lng === undefined)) {
    throw new TusAbort(422, 'invalid_upload_metadata', 'Invalid upload metadata — lat and lng must be sent together');
  }
  return parsed.data;
}

/** Keep only schema-known keys as raw strings + the server-forced workerId. */
function normalizeMetadata(
  raw: Record<string, unknown> | undefined,
  parsed: UploadMetadata,
  userId: string,
): Record<string, string> {
  void parsed; // validation happened already — normalization works off raw values
  const out: Record<string, string> = { workerId: userId };
  for (const key of METADATA_KEYS) {
    const v = raw?.[key];
    if (typeof v === 'string' && v !== '') out[key] = v;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Assessment checks (shared by create + finish hooks)                 */
/* ------------------------------------------------------------------ */

async function assertWritable(assessmentId: string, userId: string): Promise<AssessmentDocument> {
  // visibility: workers only see their own (404 hides existence)
  const assessment = await getAssessmentFor(assessmentId, { id: userId, role: 'worker' });
  if (assessment.workerId !== userId) throw new TusAbort(404, 'not_found', 'Assessment not found');
  if (!(WORKER_WRITABLE_STATUSES as readonly string[]).includes(assessment.status)) {
    throw new TusAbort(
      409,
      'assessment_locked',
      `Evidence can only be added while the assessment is writable (current: ${assessment.status})`,
    );
  }
  return assessment;
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerTus(app: Express): void {
  const root = path.resolve(env.LOCAL_STORAGE_DIR);
  const storeDir = path.resolve(env.TUS_UPLOAD_DIR);
  if (storeDir !== root && !storeDir.startsWith(root + path.sep)) {
    throw new Error(
      `TUS_UPLOAD_DIR (${storeDir}) must live inside LOCAL_STORAGE_DIR (${root}) so uploads are storage-driver addressable`,
    );
  }
  // storage key for finished bytes: `<relative prefix>/<uploadId>` (e.g. tus/<id>)
  const prefix = path.relative(root, storeDir).split(path.sep).join('/');
  const keyFor = (uploadId: string): string => (prefix ? `${prefix}/${uploadId}` : uploadId);

  const server = new TusServer({
    datastore: new FileStore({ directory: storeDir }),
    path: TUS_PATH,
    maxSize: env.MAX_UPLOAD_BYTES,
    respectForwardedHeaders: true,
    disableTerminationForFinishedUploads: true,

    onUploadCreate: async (_req, upload) => {
      try {
        const userId = currentUserId();
        const meta = parseUploadMetadata(upload.metadata);
        await assertWritable(meta.assessmentId, userId);
        return { metadata: normalizeMetadata(upload.metadata, meta, userId) };
      } catch (err) {
        throw toAbort(err);
      }
    },

    onUploadFinish: async (_req, upload) => {
      try {
        const userId = currentUserId();
        const meta = parseUploadMetadata(upload.metadata);
        if (upload.metadata?.workerId !== userId) {
          throw new TusAbort(403, 'forbidden', 'Upload belongs to another worker');
        }
        const assessment = await assertWritable(meta.assessmentId, userId);
        await createEvidenceRecord({
          assessmentId: meta.assessmentId,
          workerId: userId,
          round: assessment.round,
          taskId: meta.taskId,
          kind: meta.kind,
          storageKey: keyFor(upload.id),
          mimeType: meta.mimeType,
          capturedAt: meta.capturedAt,
          clientSha256: meta.clientSha256,
          deviceId: meta.deviceId,
          appVersion: meta.appVersion,
          gps:
            meta.lat !== undefined && meta.lng !== undefined
              ? { lat: meta.lat, lng: meta.lng, accuracy: meta.accuracy, source: 'gps' }
              : undefined,
          language: meta.language,
          narrationText: meta.narrationText,
          narrationSource: meta.narrationSource,
        });
        return {};
      } catch (err) {
        throw toAbort(err);
      }
    },

    onIncomingRequest: async (_req, uploadId) => {
      const userId = currentUserId();
      if (!uploadId) return; // creation — validated by onUploadCreate moments later
      try {
        const existing = await server.datastore.getUpload(uploadId);
        const owner = existing.metadata?.workerId;
        if (typeof owner !== 'string' || owner === '') {
          throw new TusAbort(403, 'forbidden', 'Upload has no owner');
        }
        if (owner !== userId) {
          throw new TusAbort(403, 'forbidden', 'Upload belongs to another worker');
        }
      } catch (err) {
        // unknown id → let the datastore handlers answer 404
        if (err instanceof TusAbort) throw err;
      }
    },
  });

  const guard = authGuard('worker');
  const wrap: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new AppError(401, 'unauthorized', 'Authentication required'));
      return;
    }
    // verified JWT identity → tus hooks (server-side context, never the wire)
    identityStore.run(req.user.id, () => {
      server.handle(req, res).catch(next);
    });
  };

  app.all(TUS_PATH, guard, wrap);
  app.all(`${TUS_PATH}/:id`, guard, wrap);
}
