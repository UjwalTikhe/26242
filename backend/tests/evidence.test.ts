/**
 * Phase 3 evidence: JSON registration is storage-first (bytes exist before
 * metadata may claim them), the per-assessment SHA-256 chain + seq, dedupe on
 * storageKey, hash verification, visibility scoping, and the byte-stream
 * content route.
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

const auth = (s: Session) => bearer(s.tokens);
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const nowIso = () => new Date().toISOString();

const createAssessment = async (s: Session, body: Record<string, unknown> = {}): Promise<string> => {
  const res = await request(app).post('/api/v1/assessments').set(auth(s)).send(body);
  expect(res.status).toBe(201);
  return res.body.id as string;
};

const register = (s: Session, assessmentId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/assessments/${assessmentId}/evidence`).set(auth(s)).send(body);

const regBody = (storageKey: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
  kind: 'photo',
  sizeBytes: 16,
  capturedAt: nowIso(),
  storageKey,
  ...over,
});

/** Stage bytes in storage — the register path requires them to exist. */
const stage = async (key: string, data: Buffer): Promise<void> => {
  await getStorage().put(key, data);
};

const listEvidence = (s: Session, assessmentId: string, qs = '') =>
  request(app).get(`/api/v1/assessments/${assessmentId}/evidence${qs}`).set(auth(s));

async function flowToPlan(s: Session): Promise<string> {
  const id = await createAssessment(s);
  await request(app)
    .post(`/api/v1/assessments/${id}/declaration`)
    .set(auth(s))
    .send({
      answers: {
        yearsExperience: 6,
        workTypes: ['house wiring'],
        toolsUsed: ['multimeter'],
        tasksCanPerform: ['cable termination'],
        sectors: ['electrical'],
      },
      language: 'en',
    })
    .expect(201);
  await request(app).post(`/api/v1/assessments/${id}/map`).set(auth(s)).send({}).expect(200);
  await request(app).post(`/api/v1/assessments/${id}/plan`).set(auth(s)).send({}).expect(201);
  return id;
}

describe('JSON registration (storage-first)', () => {
  it('registers a staged artifact, hashes server-side, starts the chain', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const bytes = Buffer.from('evidence bytes — photo of the distribution board');
    const key = 'uploads/board-01.jpg';
    await stage(key, bytes);

    const res = await register(
      worker,
      id,
      regBody(key, { clientSha256: sha256(bytes), mimeType: 'image/jpeg', language: 'hi', deviceId: 'dev-1' }),
    );
    expect(res.status).toBe(201);
    const ev = EvidenceSchema.parse(res.body);

    expect(ev.assessmentId).toBe(id);
    expect(ev.workerId).toBe(worker.user.id);
    expect(ev.storageKey).toBe(key);
    expect(ev.sizeBytes).toBe(bytes.length);
    expect(ev.kind).toBe('photo');
    expect(ev.status).toBe('received');
    expect(ev.round).toBe(1);
    expect(ev.seq).toBe(0);
    expect(ev.integrity.serverSha256).toBe(sha256(bytes));
    expect(ev.integrity.hashVerified).toBe(true);
    expect(ev.integrity.chainPrev).toBeUndefined();
    expect(ev.integrity.chainHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('appends seq and links chainPrev → chainHash per assessment', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);

    const b1 = Buffer.from('first artifact');
    const b2 = Buffer.from('second artifact');
    await stage('uploads/one.bin', b1);
    await stage('uploads/two.bin', b2);

    const first = EvidenceSchema.parse(
      (await register(worker, id, regBody('uploads/one.bin', { kind: 'document' }))).body,
    );
    const second = EvidenceSchema.parse(
      (await register(worker, id, regBody('uploads/two.bin', { kind: 'document' }))).body,
    );

    expect(second.seq).toBe(1);
    expect(second.integrity.chainPrev).toBe(first.integrity.chainHash);
    expect(second.integrity.chainHash).not.toBe(first.integrity.chainHash);
    expect(second.integrity.chainHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('dedupes the same storageKey to a single record', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const bytes = Buffer.from('duplicate-me');
    await stage('uploads/dup.bin', bytes);

    const a = await register(worker, id, regBody('uploads/dup.bin'));
    const b = await register(worker, id, regBody('uploads/dup.bin'));
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);

    const list = await listEvidence(worker, id);
    expect(list.body.total).toBe(1);
  });

  it('flags a client hash mismatch without rejecting the upload', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const bytes = Buffer.from('tampered bytes');
    await stage('uploads/tampered.bin', bytes);

    const res = await register(worker, id, regBody('uploads/tampered.bin', { clientSha256: '0'.repeat(64) }));
    expect(res.status).toBe(201);
    const ev = EvidenceSchema.parse(res.body);
    expect(ev.integrity.hashVerified).toBe(false);
    expect(ev.integrity.serverSha256).toBe(sha256(bytes)); // server truth wins
  });

  it('rejects a registration without storageKey (bytes first, metadata after)', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const res = await register(worker, id, { kind: 'photo', sizeBytes: 5, capturedAt: nowIso() });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.message).toContain('storageKey');
  });

  it('404s a storageKey whose bytes never arrived', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const res = await register(worker, id, regBody('uploads/never-uploaded.jpg'));
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('400s a traversal storageKey before touching the filesystem', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const res = await register(worker, id, regBody('../../escape.jpg'));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_storage_key');
  });

  it('404s another worker’s assessment and 403s assessors', async () => {
    const worker = await loginWorker(app);
    const other = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const id = await createAssessment(worker);
    await stage('uploads/scoped.bin', Buffer.from('scoped'));

    await register(other, id, regBody('uploads/scoped.bin')).expect(404);
    await register(assessor, id, regBody('uploads/scoped.bin')).expect(403);
  });

  it('409s once the assessment is locked (SUBMITTED)', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    await Assessment.updateOne({ _id: id }, { $set: { status: 'SUBMITTED' } });
    await stage('uploads/locked.bin', Buffer.from('locked'));

    const res = await register(worker, id, regBody('uploads/locked.bin'));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('assessment_locked');
  });
});

describe('task scoping', () => {
  it('accepts a plan task id and 404s an unknown one', async () => {
    const worker = await loginWorker(app);
    const id = await flowToPlan(worker);
    const plan = await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(worker));
    const taskId = plan.body.tasks[0].id as string;

    await stage('uploads/task-ok.bin', Buffer.from('for a plan task'));
    const ok = await register(worker, id, regBody('uploads/task-ok.bin', { taskId }));
    expect(ok.status).toBe(201);
    expect(ok.body.taskId).toBe(taskId);

    await stage('uploads/task-bad.bin', Buffer.from('for nobody'));
    const bad = await register(worker, id, regBody('uploads/task-bad.bin', { taskId: randomUUID() }));
    expect(bad.status).toBe(404);
    expect(bad.body.message).toContain('Task not found');
  });
});

describe('listing', () => {
  it('paginates and role-scopes the feed', async () => {
    const worker = await loginWorker(app);
    const other = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const id = await createAssessment(worker);

    for (let i = 0; i < 3; i += 1) {
      const key = `uploads/page-${i}.bin`;
      await stage(key, Buffer.from(`artifact ${i}`));
      await register(worker, id, regBody(key, { kind: 'document' }));
    }

    const page1 = await listEvidence(worker, id, '?page=1&limit=2');
    expect(page1.status).toBe(200);
    EvidenceListRes.parse(page1.body);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(3);
    expect(page1.body.page).toBe(1);
    expect(page1.body.limit).toBe(2);

    const page2 = await listEvidence(worker, id, '?page=2&limit=2');
    expect(page2.body.items).toHaveLength(1);
    // append order: seq increases across pages
    const seqs = [...page1.body.items, ...page2.body.items].map((i: { seq: number }) => i.seq);
    expect(seqs).toEqual([0, 1, 2]);

    await listEvidence(assessor, id).expect(200);
    await listEvidence(other, id).expect(404);
    await request(app).get(`/api/v1/assessments/${id}/evidence`).expect(401);
  });
});

describe('content stream', () => {
  it('streams the exact stored bytes with integrity headers', async () => {
    const worker = await loginWorker(app);
    const id = await createAssessment(worker);
    const bytes = Buffer.from('binary evidence payload, streamed verbatim');
    await stage('uploads/stream.bin', bytes);
    const registered = await register(worker, id, regBody('uploads/stream.bin', { mimeType: 'image/jpeg' }));
    const evidenceId = registered.body.id as string;

    const res = await request(app).get(`/api/v1/evidence/${evidenceId}/content`).set(auth(worker));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['content-length']).toBe(String(bytes.length));
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.equals(bytes)).toBe(true);
  });

  it('scopes visibility: assessor 200, another worker 404, anonymous 401', async () => {
    const worker = await loginWorker(app);
    const other = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const id = await createAssessment(worker);
    await stage('uploads/visible.bin', Buffer.from('visible bytes'));
    const registered = await register(worker, id, regBody('uploads/visible.bin'));
    const evidenceId = registered.body.id as string;

    await request(app).get(`/api/v1/evidence/${evidenceId}/content`).set(auth(assessor)).expect(200);
    await request(app).get(`/api/v1/evidence/${evidenceId}/content`).set(auth(other)).expect(404);
    await request(app).get(`/api/v1/evidence/${evidenceId}/content`).expect(401);
    await request(app).get(`/api/v1/evidence/${randomUUID()}/content`).set(auth(worker)).expect(404);
  });
});
