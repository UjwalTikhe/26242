/**
 * Phase 3 tus uploads at /api/v1/files: create → HEAD resume → chunked PATCH
 * → Evidence auto-created on finish (storage key `tus/<uploadId>`), plus the
 * auth / metadata / ownership / assessment-lock guards around byte transport.
 */
import { createHash, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { Evidence as EvidenceSchema, EvidenceListRes } from '@sih/contracts';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { Assessment } from '../src/models/assessment.models.js';
import { getStorage, resetStorage } from '../src/storage/index.js';
import { bearer, loginAssessor, loginWorker, type Session } from './helpers/auth.js';
import { clearDb, startDb, stopDb } from './helpers/db.js';

const app: Express = createApp();

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
  await rm(path.resolve(env.LOCAL_STORAGE_DIR), { recursive: true, force: true });
  resetStorage();
});

const TUS = '/api/v1/files';
const auth = (s: Session) => bearer(s.tokens);
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const b64 = (v: string | number) => Buffer.from(String(v), 'utf8').toString('base64');

/** tus metadata wire format: `key base64value` pairs joined by `,`. */
const uploadMeta = (fields: Record<string, string | number | undefined>): string =>
  Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k} ${b64(v as string | number)}`)
    .join(',');

const metaFor = (assessmentId: string, over: Record<string, string | number | undefined> = {}): string =>
  uploadMeta({ kind: 'photo', capturedAt: new Date().toISOString(), assessmentId, ...over });

/** tus hook errors have no content-type — extract text from wherever it landed. */
const rawOf = (res: { text?: string; body?: unknown }): string => {
  if (typeof res.text === 'string' && res.text.length > 0) return res.text;
  const body = res.body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (body && typeof body === 'object' && Object.keys(body as object).length > 0) return JSON.stringify(body);
  return '';
};

const createAssessment = async (s: Session): Promise<string> => {
  const res = await request(app).post('/api/v1/assessments').set(auth(s)).send({});
  expect(res.status).toBe(201);
  return res.body.id as string;
};

const createUpload = (s: Session, metadata: string | undefined, length: number) => {
  const req = request(app).post(TUS).set(auth(s)).set('Tus-Resumable', '1.0.0').set('Upload-Length', String(length));
  if (metadata !== undefined) req.set('Upload-Metadata', metadata);
  return req;
};

const patch = (s: Session, uploadPath: string, offset: number, bytes: Buffer) =>
  request(app)
    .patch(uploadPath)
    .set(auth(s))
    .set('Tus-Resumable', '1.0.0')
    .set('Upload-Offset', String(offset))
    .set('Content-Type', 'application/offset+octet-stream')
    .send(bytes);

const head = (s: Session, uploadPath: string) =>
  request(app).head(uploadPath).set(auth(s)).set('Tus-Resumable', '1.0.0');

const listEvidence = (s: Session, assessmentId: string) =>
  request(app).get(`/api/v1/assessments/${assessmentId}/evidence`).set(auth(s));

const pathOf = (location: string): string => new URL(location, 'http://localhost').pathname;

describe('tus happy path: create → resume → finish → evidence', () => {
  it('uploads in one PATCH and auto-creates the Evidence record', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await createAssessment(worker);
    const bytes = Buffer.from('tus evidence payload — a photograph of the completed joint');

    const created = await createUpload(
      worker,
      metaFor(assessmentId, { mimeType: 'image/jpeg', deviceId: 'dev-1' }),
      bytes.length,
    );
    expect(created.status).toBe(201);
    expect(created.headers.location).toBeTruthy();
    const uploadPath = pathOf(created.headers.location);
    const uploadId = uploadPath.split('/').pop() as string;

    const h0 = await head(worker, uploadPath);
    expect(h0.status).toBe(200);
    expect(h0.headers['upload-offset']).toBe('0');

    const patched = await patch(worker, uploadPath, 0, bytes);
    expect(patched.status).toBe(204);
    expect(patched.headers['upload-offset']).toBe(String(bytes.length));

    const h1 = await head(worker, uploadPath);
    expect(h1.status).toBe(200);
    expect(h1.headers['upload-offset']).toBe(String(bytes.length));

    const list = await listEvidence(worker, assessmentId);
    expect(list.status).toBe(200);
    EvidenceListRes.parse(list.body);
    expect(list.body.total).toBe(1);

    const ev = EvidenceSchema.parse(list.body.items[0]);
    expect(ev.storageKey).toBe(`tus/${uploadId}`);
    expect(ev.sizeBytes).toBe(bytes.length);
    expect(ev.integrity.serverSha256).toBe(sha256(bytes));
    expect(ev.kind).toBe('photo');
    expect(ev.mimeType).toBe('image/jpeg');
    expect(ev.deviceId).toBe('dev-1');
    expect(ev.workerId).toBe(worker.user.id);
    expect(ev.seq).toBe(0);
    expect(ev.integrity.chainHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await getStorage().exists(ev.storageKey)).toBe(true);
  });

  it('resumes across chunked PATCHes with HEAD in between', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await createAssessment(worker);
    const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz-chunked-upload-payload');
    const half = Math.floor(bytes.length / 2);

    const created = await createUpload(worker, metaFor(assessmentId), bytes.length);
    expect(created.status).toBe(201);
    const uploadPath = pathOf(created.headers.location);

    const first = await patch(worker, uploadPath, 0, bytes.subarray(0, half));
    expect(first.status).toBe(204);
    expect(first.headers['upload-offset']).toBe(String(half));

    // client crashed here — comes back, asks where to resume
    const resume = await head(worker, uploadPath);
    expect(resume.headers['upload-offset']).toBe(String(half));

    const second = await patch(worker, uploadPath, half, bytes.subarray(half));
    expect(second.status).toBe(204);
    expect(second.headers['upload-offset']).toBe(String(bytes.length));

    const list = await listEvidence(worker, assessmentId);
    expect(list.body.total).toBe(1);
    const ev = EvidenceSchema.parse(list.body.items[0]);
    expect(ev.sizeBytes).toBe(bytes.length);
    expect(ev.integrity.serverSha256).toBe(sha256(bytes));
  });
});

describe('tus guards', () => {
  it('422s invalid metadata and accepts a fixed retry', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await createAssessment(worker);
    const bytes = Buffer.from('retry me');

    const bad = await createUpload(worker, metaFor(assessmentId, { kind: 'banana' }), bytes.length);
    expect(bad.status).toBe(422);
    expect(rawOf(bad)).toContain('invalid_upload_metadata');

    // the same assessment can still open a correctly-described upload
    const good = await createUpload(worker, metaFor(assessmentId), bytes.length);
    expect(good.status).toBe(201);
    await patch(worker, pathOf(good.headers.location), 0, bytes).expect(204);
  });

  it('422s a missing metadata header and 400s malformed base64', async () => {
    const worker = await loginWorker(app);
    const missing = await createUpload(worker, undefined, 10);
    expect(missing.status).toBe(422);

    const malformed = await request(app)
      .post(TUS)
      .set(auth(worker))
      .set('Tus-Resumable', '1.0.0')
      .set('Upload-Length', '10')
      .set('Upload-Metadata', 'kind !!!!'); // key <space> invalid-base64 value
    expect(malformed.status).toBe(400);
    expect(rawOf(malformed)).toContain('upload-metadata');
  });

  it('401s anonymous callers and 403s assessors before any upload starts', async () => {
    const assessmentId = randomUUID();

    const anon = await request(app)
      .post(TUS)
      .set('Tus-Resumable', '1.0.0')
      .set('Upload-Length', '10')
      .set('Upload-Metadata', metaFor(assessmentId));
    expect(anon.status).toBe(401);
    expect(anon.body.error).toBe('unauthorized');

    const assessor = await loginAssessor(app);
    const asAssessor = await createUpload(assessor, metaFor(assessmentId), 10);
    expect(asAssessor.status).toBe(403);
    expect(asAssessor.body.error).toBe('forbidden');
  });

  it('404s an upload pointed at another worker’s assessment', async () => {
    const owner = await loginWorker(app);
    const intruder = await loginWorker(app);
    const assessmentId = await createAssessment(owner);

    const res = await createUpload(intruder, metaFor(assessmentId), 10);
    expect(res.status).toBe(404);
    expect(rawOf(res)).toContain('not_found');
  });

  it('409s once the assessment is locked (SUBMITTED)', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await createAssessment(worker);
    await Assessment.updateOne({ _id: assessmentId }, { $set: { status: 'SUBMITTED' } });

    const res = await createUpload(worker, metaFor(assessmentId), 10);
    expect(res.status).toBe(409);
    expect(rawOf(res)).toContain('assessment_locked');
  });

  it('locks resume verbs to the upload owner', async () => {
    const owner = await loginWorker(app);
    const other = await loginWorker(app);
    const assessmentId = await createAssessment(owner);
    const bytes = Buffer.from('owner-only bytes');

    const created = await createUpload(owner, metaFor(assessmentId), bytes.length);
    expect(created.status).toBe(201);
    const uploadPath = pathOf(created.headers.location);

    const headByOther = await head(other, uploadPath);
    expect(headByOther.status).toBe(403);

    const patchByOther = await patch(other, uploadPath, 0, bytes);
    expect(patchByOther.status).toBe(403);

    // owner is unaffected and can finish the upload
    await head(owner, uploadPath).expect(200);
    await patch(owner, uploadPath, 0, bytes).expect(204);
    const list = await listEvidence(owner, assessmentId);
    expect(list.body.total).toBe(1);
  });
});
