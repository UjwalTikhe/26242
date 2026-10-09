/**
 * Phase 3 offline sync: push (per-op isolation, idempotency memoization with
 * retryable rejections, LWW/declaration/answers semantics) and pull (worker-
 * scoped ObjectId change feed with cursor paging). Direct answers routes are
 * covered here too — they share the LWW write path the queue replays.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { SubmitAnswersRes, SyncPullRes, SyncPushRes } from '@sih/contracts';
import { createApp } from '../src/app.js';
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
});

const auth = (s: Session) => bearer(s.tokens);
const iso = () => new Date().toISOString();

const push = (s: Session, ops: Record<string, unknown>[]) =>
  request(app).post('/api/v1/sync/push').set(auth(s)).send({ ops });

const pull = (s: Session, qs = '') => request(app).get(`/api/v1/sync/pull${qs}`).set(auth(s));

const profileOp = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  opId: randomUUID(),
  idempotencyKey: randomUUID(),
  entity: 'profile',
  action: 'update',
  clientUpdatedAt: iso(),
  payload: { version: 0, clientUpdatedAt: iso(), patch: { fullName: 'Offline Name' } },
  ...over,
});

const declarationPayload = (assessmentId: string): Record<string, unknown> => ({
  assessmentId,
  answers: {
    yearsExperience: 6,
    workTypes: ['house wiring'],
    toolsUsed: ['multimeter'],
    tasksCanPerform: ['cable termination'],
    sectors: ['electrical'],
  },
  language: 'en',
});

const createAssessment = async (s: Session, body: Record<string, unknown> = {}): Promise<string> => {
  const res = await request(app).post('/api/v1/assessments').set(auth(s)).send(body);
  expect(res.status).toBe(201);
  return res.body.id as string;
};

async function flowToPlan(s: Session): Promise<string> {
  const id = await createAssessment(s);
  await request(app)
    .post(`/api/v1/assessments/${id}/declaration`)
    .set(auth(s))
    .send(declarationPayload(id))
    .expect(201);
  await request(app).post(`/api/v1/assessments/${id}/map`).set(auth(s)).send({}).expect(200);
  await request(app).post(`/api/v1/assessments/${id}/plan`).set(auth(s)).send({}).expect(201);
  return id;
}

const planTaskId = async (s: Session, id: string): Promise<string> => {
  const plan = await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(s));
  expect(plan.status).toBe(200);
  return plan.body.tasks[0].id as string;
};

describe('push: profile (LWW + idempotency)', () => {
  it('applies, memoizes the replay, and reports stale writes as conflict', async () => {
    const worker = await loginWorker(app);
    const key = randomUUID();

    const first = await push(worker, [profileOp({ idempotencyKey: key })]);
    expect(first.status).toBe(200);
    SyncPushRes.parse(first.body);
    expect(first.body.results).toHaveLength(1);
    expect(first.body.results[0].status).toBe('applied');
    expect(first.body.results[0].serverVersion).toBe(1);

    // replay with the same idempotency key (fresh opId, e.g. lost response)
    const replay = await push(worker, [profileOp({ idempotencyKey: key })]);
    expect(replay.body.results[0].status).toBe('duplicate');
    expect(replay.body.results[0].serverVersion).toBe(1);

    // fresh key but stale version → LWW conflict, server version surfaced
    const stale = await push(worker, [profileOp({ idempotencyKey: randomUUID() })]);
    expect(stale.body.results[0].status).toBe('conflict');
    expect(stale.body.results[0].serverVersion).toBe(1);

    const profile = await request(app).get('/api/v1/profile').set(auth(worker));
    expect(profile.status).toBe(200);
    expect(profile.body.fullName).toBe('Offline Name');
    expect(profile.body.version).toBe(1);
  });

  it('does NOT memoize rejected ops — a fixed payload may retry the same key', async () => {
    const worker = await loginWorker(app);
    const key = randomUUID();

    const bad = await push(worker, [
      profileOp({ idempotencyKey: key, payload: { version: -1, clientUpdatedAt: iso(), patch: {} } }),
    ]);
    expect(bad.body.results[0].status).toBe('rejected');
    expect(bad.body.results[0].message).toBeTruthy();

    const fixed = await push(worker, [profileOp({ idempotencyKey: key })]);
    expect(fixed.body.results[0].status).toBe('applied');
    expect(fixed.body.results[0].serverVersion).toBe(1);
  });
});

describe('push: declaration (write-once)', () => {
  it('applies once and dedupes replays and duplicate pushes', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await createAssessment(worker);
    const mkOp = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
      opId: randomUUID(),
      idempotencyKey: randomUUID(),
      entity: 'declaration',
      action: 'create',
      clientUpdatedAt: iso(),
      payload: declarationPayload(assessmentId),
      ...over,
    });

    const key = randomUUID();
    const first = await push(worker, [mkOp({ idempotencyKey: key })]);
    SyncPushRes.parse(first.body);
    expect(first.body.results[0].status).toBe('applied');
    expect(first.body.results[0].serverVersion).toBe(1);

    // memoized replay: same idempotency key
    const replay = await push(worker, [mkOp({ idempotencyKey: key })]);
    expect(replay.body.results[0].status).toBe('duplicate');

    // different key, same declaration: write-once service dedupes
    const other = await push(worker, [mkOp()]);
    expect(other.body.results[0].status).toBe('duplicate');

    const fetched = await request(app).get(`/api/v1/assessments/${assessmentId}/declaration`).set(auth(worker));
    expect(fetched.status).toBe(200);
  });
});

describe('push: answers', () => {
  it('rejects an answers op when the plan does not exist yet', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await createAssessment(worker);
    const res = await push(worker, [
      {
        opId: randomUUID(),
        idempotencyKey: randomUUID(),
        entity: 'answers',
        action: 'update',
        clientUpdatedAt: iso(),
        payload: { assessmentId, taskId: randomUUID(), answers: { selectedOptionIds: ['opt-1'] } },
      },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('rejected');
    expect(res.body.results[0].message).toContain('plan');
  });

  it('applies, dedupes identical content, and conflicts on stale timestamps', async () => {
    const worker = await loginWorker(app);
    const assessmentId = await flowToPlan(worker);
    const taskId = await planTaskId(worker, assessmentId);
    const mkOp = (content: string, at: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({
      opId: randomUUID(),
      idempotencyKey: randomUUID(),
      entity: 'answers',
      action: 'update',
      clientUpdatedAt: at,
      payload: { assessmentId, taskId, answers: { selectedOptionIds: [content] } },
      ...over,
    });

    const t1 = new Date(Date.now() - 5_000).toISOString();
    const t2 = new Date(Date.now() - 3_000).toISOString();
    const tStale = new Date(Date.now() - 8_000).toISOString();

    const first = await push(worker, [mkOp('opt-1', t1)]);
    expect(first.body.results[0].status).toBe('applied');

    // identical content + new key → no-write replay
    const sameContent = await push(worker, [mkOp('opt-1', t1)]);
    expect(sameContent.body.results[0].status).toBe('duplicate');

    // newer content → applied
    const newer = await push(worker, [mkOp('opt-2', t2)]);
    expect(newer.body.results[0].status).toBe('applied');

    // stale content → server copy wins
    const stale = await push(worker, [mkOp('opt-3', tStale)]);
    expect(stale.body.results[0].status).toBe('conflict');

    const list = await request(app).get(`/api/v1/assessments/${assessmentId}/answers`).set(auth(worker));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].answers.selectedOptionIds).toEqual(['opt-2']);
  });
});

describe('push: batch semantics', () => {
  it('keeps results aligned with ops and isolates a bad op', async () => {
    const worker = await loginWorker(app);
    const draftId = await createAssessment(worker);

    const good = profileOp();
    const bad: Record<string, unknown> = {
      opId: randomUUID(),
      idempotencyKey: randomUUID(),
      entity: 'answers',
      action: 'update',
      clientUpdatedAt: iso(),
      payload: { assessmentId: draftId, taskId: randomUUID(), answers: { selectedOptionIds: [] } },
    };

    const res = await push(worker, [good, bad]);
    SyncPushRes.parse(res.body);
    expect(res.body.results.map((r: { opId: string }) => r.opId)).toEqual([good.opId, bad.opId]);
    expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['applied', 'rejected']);
  });
});

describe('pull: cursor change feed', () => {
  it('returns worker-scoped changes with cursor paging', async () => {
    const a = await loginWorker(app);
    const b = await loginWorker(app);
    const assessmentId = await createAssessment(a);
    await createAssessment(a); // a 3rd change so the feed spans more than one page

    const all = await pull(a);
    expect(all.status).toBe(200);
    SyncPullRes.parse(all.body);
    expect(all.body.hasMore).toBe(false);
    const entities = new Set(all.body.changes.map((c: { entity: string }) => c.entity));
    expect(entities.has('profile')).toBe(true); // bootstrapped at login
    expect(entities.has('assessment')).toBe(true); // created above
    expect(all.body.changes.length).toBeGreaterThanOrEqual(2);

    // page through with limit=1: no overlap, forward-only cursor
    const p1 = await pull(a, '?limit=1');
    SyncPullRes.parse(p1.body);
    expect(p1.body.changes).toHaveLength(1);
    expect(p1.body.hasMore).toBe(true);
    expect(p1.body.nextCursor).toBeTruthy();

    const p2 = await pull(a, `?limit=1&cursor=${p1.body.nextCursor}`);
    expect(p2.body.changes).toHaveLength(1);
    expect(p2.body.changes[0].id).not.toBe(p1.body.changes[0].id);
    expect(p2.body.hasMore).toBe(true);

    // worker B only ever sees B's own feed
    const forB = await pull(b);
    expect(forB.body.changes.every((c: { entity: string }) => c.entity === 'profile')).toBe(true);
    expect(
      forB.body.changes.some((c: { data?: { id?: string } }) => c.data?.id === assessmentId),
    ).toBe(false);
  });

  it('400s an invalid cursor', async () => {
    const worker = await loginWorker(app);
    const res = await pull(worker, '?cursor=zzz');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_cursor');
  });
});

describe('sync auth + validation', () => {
  it('rejects assessors (worker-only), anonymous callers, and empty batches', async () => {
    const worker = await loginWorker(app);
    const assessor = await loginAssessor(app);

    await push(assessor, [profileOp()]).expect(403);
    await pull(assessor).expect(403);
    await request(app).post('/api/v1/sync/push').send({ ops: [profileOp()] }).expect(401);
    await request(app).get('/api/v1/sync/pull').expect(401);

    const empty = await push(worker, []);
    expect(empty.status).toBe(422);
    expect(empty.body.error).toBe('validation_error');
  });
});

describe('direct answers routes (shared LWW write path)', () => {
  it('stores answers with last-write-wins semantics', async () => {
    const worker = await loginWorker(app);
    const id = await flowToPlan(worker);
    const taskId = await planTaskId(worker, id);
    const post = (body: Record<string, unknown>) =>
      request(app).post(`/api/v1/assessments/${id}/answers`).set(auth(worker)).send(body);

    const t1 = new Date(Date.now() - 5_000).toISOString();
    const t2 = new Date(Date.now() - 3_000).toISOString();
    const tStale = new Date(Date.now() - 8_000).toISOString();

    const w1 = await post({ taskId, answers: { selectedOptionIds: ['opt-x'] }, clientUpdatedAt: t1 });
    expect(w1.status).toBe(200);
    SubmitAnswersRes.parse(w1.body);
    expect(w1.body.response.taskId).toBe(taskId);
    expect(w1.body.response.answers.selectedOptionIds).toEqual(['opt-x']);
    expect(w1.body.assessment.id).toBe(id);

    const w2 = await post({ taskId, answers: { selectedOptionIds: ['opt-y'] }, clientUpdatedAt: t2 });
    expect(w2.body.response.id).toBe(w1.body.response.id); // same record, not a fork

    // stale write loses — server copy stays newest
    const stale = await post({ taskId, answers: { selectedOptionIds: ['opt-z'] }, clientUpdatedAt: tStale });
    expect(stale.status).toBe(200);
    expect(stale.body.response.answers.selectedOptionIds).toEqual(['opt-y']);

    const list = await request(app).get(`/api/v1/assessments/${id}/answers`).set(auth(worker));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].answers.selectedOptionIds).toEqual(['opt-y']);
  });

  it('role-scopes answers: assessor reads, workers-only writes, 404s without plan', async () => {
    const worker = await loginWorker(app);
    const other = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const id = await flowToPlan(worker);
    const taskId = await planTaskId(worker, id);

    const body = { taskId, answers: { checkedItemIds: ['step-1'] } };
    await request(app).post(`/api/v1/assessments/${id}/answers`).set(auth(assessor)).send(body).expect(403);
    await request(app).post(`/api/v1/assessments/${id}/answers`).set(auth(other)).send(body).expect(404);
    await request(app).get(`/api/v1/assessments/${id}/answers`).set(auth(assessor)).expect(200);
    await request(app).get(`/api/v1/assessments/${id}/answers`).set(auth(other)).expect(404);

    // no plan yet → explicit 404 (never a silent partial write)
    const draftId = await createAssessment(worker);
    const noPlan = await request(app)
      .post(`/api/v1/assessments/${draftId}/answers`)
      .set(auth(worker))
      .send({ taskId: randomUUID(), answers: { selectedOptionIds: [] } });
    expect(noPlan.status).toBe(404);
    expect(noPlan.body.message).toContain('plan');

    // plan exists, unknown task → 404
    const unknownTask = await request(app)
      .post(`/api/v1/assessments/${id}/answers`)
      .set(auth(worker))
      .send({ taskId: randomUUID(), answers: { selectedOptionIds: [] } });
    expect(unknownTask.status).toBe(404);
    expect(unknownTask.body.message).toContain('Task not found');
  });
});
