/**
 * Phase 2 assessment flow: create (idempotent client UUID) → self-declaration
 * → NSQF mapping (top-3, deterministic) → plan generation (answer key kept
 * server-side) → start. Includes role scoping and state-machine guards.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import {
  Assessment,
  AssessmentPlan,
  Declaration,
  PublicPlanRes,
  QPMatch,
  TASK_TYPES,
} from '@sih/contracts';
import { createApp } from '../src/app.js';
import { clearDb, startDb, stopDb } from './helpers/db.js';
import { bearer, loginAssessor, loginWorker, type Session } from './helpers/auth.js';

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

const createAssessment = (s: Session, body: Record<string, unknown> = {}) =>
  request(app).post('/api/v1/assessments').set(auth(s)).send(body);

const submitDeclaration = (s: Session, id: string, body?: Record<string, unknown>) =>
  request(app)
    .post(`/api/v1/assessments/${id}/declaration`)
    .set(auth(s))
    .send(
      body ?? {
        answers: {
          yearsExperience: 6,
          workTypes: ['house wiring', 'switch board installation'],
          toolsUsed: ['multimeter', 'wire stripper'],
          tasksCanPerform: ['cable termination'],
          sectors: ['electrical'],
        },
        language: 'en',
      },
    );

const map = (s: Session, id: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/v1/assessments/${id}/map`).set(auth(s)).send(body);

const generatePlan = (s: Session, id: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/v1/assessments/${id}/plan`).set(auth(s)).send(body);

const start = (s: Session, id: string) =>
  request(app).post(`/api/v1/assessments/${id}/start`).set(auth(s)).send({});

/** Drive an assessment up to the requested status. */
async function flowTo(
  s: Session,
  target: 'DRAFT' | 'DECLARED' | 'MAPPED' | 'PLAN_READY' | 'IN_PROGRESS',
  createBody: Record<string, unknown> = {},
): Promise<{ id: string }> {
  const created = await createAssessment(s, createBody);
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  if (target === 'DRAFT') return { id };
  await submitDeclaration(s, id);
  if (target === 'DECLARED') return { id };
  await map(s, id);
  if (target === 'MAPPED') return { id };
  await generatePlan(s, id);
  if (target === 'PLAN_READY') return { id };
  await start(s, id);
  return { id };
}

describe('assessment creation', () => {
  it('creates a DRAFT with client UUID idempotently', async () => {
    const worker = await loginWorker(app);
    const id = randomUUID();

    const first = await createAssessment(worker, { id, language: 'hi', tradeHint: 'welder' });
    expect(first.status).toBe(201);
    Assessment.parse(first.body);
    expect(first.body.id).toBe(id);
    expect(first.body.status).toBe('DRAFT');
    expect(first.body.round).toBe(1);
    expect(first.body.language).toBe('hi');
    expect(first.body.statusHistory).toHaveLength(1);
    expect(first.body.statusHistory[0].status).toBe('DRAFT');

    // offline replay: same client UUID → same assessment, no duplicates
    const replay = await createAssessment(worker, { id, language: 'hi' });
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(id);
    expect(replay.body.statusHistory).toHaveLength(1);
  });

  it('generates an id when the client sends none', async () => {
    const worker = await loginWorker(app);
    const res = await createAssessment(worker, {});
    expect(res.status).toBe(201);
    Assessment.parse(res.body);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects taking over another worker’s assessment id', async () => {
    const a = await loginWorker(app);
    const b = await loginWorker(app);
    const id = randomUUID();
    await createAssessment(a, { id }).expect(201);
    const stolen = await createAssessment(b, { id });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error).toBe('id_taken');
  });
});

describe('visibility and listing', () => {
  it('hides other workers’ assessments (404) but shows them to assessors', async () => {
    const a = await loginWorker(app);
    const b = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const { id } = await flowTo(a, 'DRAFT');

    const asOther = await request(app).get(`/api/v1/assessments/${id}`).set(auth(b));
    expect(asOther.status).toBe(404);

    const asAssessor = await request(app).get(`/api/v1/assessments/${id}`).set(auth(assessor));
    expect(asAssessor.status).toBe(200);
    Assessment.parse(asAssessor.body);
  });

  it('lists are role-scoped and filterable', async () => {
    const a = await loginWorker(app);
    const b = await loginWorker(app);
    const assessor = await loginAssessor(app);

    await flowTo(a, 'DRAFT');
    const declared = await flowTo(a, 'DECLARED');
    await flowTo(b, 'DRAFT');

    const mine = await request(app).get('/api/v1/assessments').set(auth(a));
    expect(mine.status).toBe(200);
    expect(mine.body.total).toBe(2);
    expect(mine.body.items.every((i: { workerId: string }) => i.workerId === a.user.id)).toBe(true);

    // a worker cannot probe another worker via the query filter
    const probe = await request(app)
      .get(`/api/v1/assessments?workerId=${b.user.id}`)
      .set(auth(a));
    expect(probe.body.items.every((i: { workerId: string }) => i.workerId === a.user.id)).toBe(true);

    const forAssessor = await request(app).get('/api/v1/assessments').set(auth(assessor));
    expect(forAssessor.body.total).toBe(3);

    const drafts = await request(app)
      .get('/api/v1/assessments?status=DRAFT')
      .set(auth(assessor));
    expect(drafts.body.items.every((i: { status: string }) => i.status === 'DRAFT')).toBe(true);
    expect(drafts.body.total).toBe(2);

    const declaredOnly = await request(app)
      .get(`/api/v1/assessments?status=DECLARED&workerId=${a.user.id}`)
      .set(auth(assessor));
    expect(declaredOnly.body.total).toBe(1);
    expect(declaredOnly.body.items[0].id).toBe(declared.id);
  });
});

describe('self-declaration', () => {
  it('advances DRAFT → DECLARED and is replay-safe', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DRAFT');

    const res = await submitDeclaration(worker, id);
    expect(res.status).toBe(201);
    Declaration.parse(res.body);
    expect(res.body.assessmentId).toBe(id);
    expect(res.body.answers.yearsExperience).toBe(6);

    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('DECLARED');
    expect(assessment.body.statusHistory.map((e: { status: string }) => e.status)).toEqual([
      'DRAFT',
      'DECLARED',
    ]);

    // replay returns the stored declaration instead of failing
    const replay = await submitDeclaration(worker, id);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(res.body.id);

    const fetched = await request(app)
      .get(`/api/v1/assessments/${id}/declaration`)
      .set(auth(worker));
    expect(fetched.status).toBe(200);
    Declaration.parse(fetched.body);
  });

  it('rejects a declaration from a non-owner and from assessors', async () => {
    const worker = await loginWorker(app);
    const other = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const { id } = await flowTo(worker, 'DRAFT');

    await submitDeclaration(other, id).expect(404);
    await submitDeclaration(assessor, id).expect(403);
  });

  it('rejects invalid answers with 422 (no partial writes)', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DRAFT');
    const res = await submitDeclaration(worker, id, { answers: { yearsExperience: 999 } });
    expect(res.status).toBe(422);
    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('DRAFT');
  });
});

describe('state machine guards', () => {
  it('rejects out-of-order steps with 409 invalid_transition', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DRAFT');

    const earlyMap = await map(worker, id);
    expect(earlyMap.status).toBe(409);
    expect(earlyMap.body.error).toBe('invalid_transition');

    const earlyStart = await request(app)
      .post(`/api/v1/assessments/${id}/start`)
      .set(auth(worker))
      .send({});
    expect(earlyStart.status).toBe(409);
    expect(earlyStart.body.error).toBe('invalid_transition');
  });

  it('rejects plan generation before mapping', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DECLARED');
    const res = await generatePlan(worker, id);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('invalid_transition');
  });
});

describe('NSQF mapping (top-3, deterministic)', () => {
  it('maps a declared assessment and advances to MAPPED', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DECLARED');

    const res = await map(worker, id, {});
    expect(res.status).toBe(200);
    QPMatch.parse(res.body);
    expect(res.body.matches.length).toBeGreaterThanOrEqual(1);
    expect(res.body.matches.length).toBeLessThanOrEqual(3);
    expect(res.body.mode).toBe('fallback');

    // sorted by confidence desc, all in range
    const confidences = res.body.matches.map((m: { confidence: number }) => m.confidence);
    expect(confidences).toEqual([...confidences].sort((a: number, b: number) => b - a));
    for (const c of confidences) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }

    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('MAPPED');

    // idempotent replay
    const replay = await map(worker, id, {});
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(res.body.id);
  });

  it('honours the creation-time trade hint (welder ranks first)', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DECLARED', { tradeHint: 'welder' });
    const res = await map(worker, id, {});
    expect(res.body.matches[0].tradePackId).toBe('welder');
    expect(res.body.matches[0].matchedConcepts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.matches[0].reasoning.length).toBeGreaterThan(10);
  });

  it('honours a map-time hint override', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'DECLARED', { tradeHint: 'electrician' });
    const res = await map(worker, id, { tradeHint: 'welder' });
    expect(res.body.matches[0].tradePackId).toBe('welder');
  });

  it('exposes the stored match on the GET route', async () => {
    const worker = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const { id } = await flowTo(worker, 'MAPPED');

    const asWorker = await request(app).get(`/api/v1/assessments/${id}/mapping`).set(auth(worker));
    expect(asWorker.status).toBe(200);
    QPMatch.parse(asWorker.body);

    const asAssessor = await request(app)
      .get(`/api/v1/assessments/${id}/mapping`)
      .set(auth(assessor));
    expect(asAssessor.status).toBe(200);
    expect(asAssessor.body.id).toBe(asWorker.body.id);
  });
});

describe('plan generation', () => {
  it('generates a plan from the top mapping, advances to PLAN_READY, weights sum to 100', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'MAPPED');

    const res = await generatePlan(worker, id);
    expect(res.status).toBe(201);
    AssessmentPlan.parse(res.body);
    expect(res.body.assessmentId).toBe(id);
    expect(res.body.generatedBy).toBe('rule');
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(8);

    const weightSum = res.body.tasks.reduce((acc: number, t: { weight: number }) => acc + t.weight, 0);
    expect(weightSum).toBeCloseTo(100, 4);
    expect(res.body.totalWeight).toBeCloseTo(100, 4);

    // worker-facing generation response already strips the answer key
    for (const task of res.body.tasks) {
      expect(task).not.toHaveProperty('correctIds');
    }

    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('PLAN_READY');
  });

  it('GET plan: worker gets stripped tasks, assessor gets the answer key', async () => {
    const worker = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const { id } = await flowTo(worker, 'PLAN_READY');

    const asWorker = await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(worker));
    expect(asWorker.status).toBe(200);
    PublicPlanRes.parse(asWorker.body);
    for (const task of asWorker.body.tasks) {
      expect(task).not.toHaveProperty('correctIds');
    }

    const asAssessor = await request(app)
      .get(`/api/v1/assessments/${id}/plan`)
      .set(auth(assessor));
    expect(asAssessor.status).toBe(200);
    expect(asAssessor.body.tasks.some((t: { correctIds?: string[] }) => (t.correctIds ?? []).length > 0)).toBe(
      true,
    );

    // other workers can't peek
    const other = await loginWorker(app);
    await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(other)).expect(404);
  });

  it('replay returns the stored plan instead of regenerating', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'PLAN_READY');
    const first = await generatePlan(worker, id);
    expect(first.status).toBe(201);
    expect(first.body.id).toBeTruthy();
    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('PLAN_READY'); // no double transition
    expect(assessment.body.version).toBe(3); // declaration + map + plan bumps
  });

  it('honours an explicit tradePackId override', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'MAPPED', { tradeHint: 'welder' });
    const res = await generatePlan(worker, id, { tradePackId: 'electrician' });
    expect(res.status).toBe(201);
    expect(res.body.tradePackId).toBe('electrician');
  });

  it('404s an unknown tradePackId', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'MAPPED');
    const res = await generatePlan(worker, id, { tradePackId: 'astronaut' });
    expect(res.status).toBe(404);
  });

  it('concrete tasks cover all six contract task types', async () => {
    const worker = await loginWorker(app);
    const { id } = await flowTo(worker, 'MAPPED');
    const res = await generatePlan(worker, id);
    const types = new Set(res.body.tasks.map((t: { type: string }) => t.type));
    for (const type of TASK_TYPES) {
      expect(types).toContain(type);
    }
    // order is dense and starts at 0
    const orders = res.body.tasks.map((t: { order: number }) => t.order);
    expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b));
    expect(orders[0]).toBe(0);
  });
});

describe('start / full happy path', () => {
  it('runs create → declare → map → plan → start with a clean status history', async () => {
    const worker = await loginWorker(app);
    const assessor = await loginAssessor(app);
    const { id } = await flowTo(worker, 'MAPPED', { tradeHint: 'electrician' });
    await generatePlan(worker, id);

    const started = await request(app)
      .post(`/api/v1/assessments/${id}/start`)
      .set(auth(worker))
      .send({});
    expect(started.status).toBe(200);
    Assessment.parse(started.body);
    expect(started.body.status).toBe('IN_PROGRESS');

    // replay is idempotent
    const replay = await request(app)
      .post(`/api/v1/assessments/${id}/start`)
      .set(auth(worker))
      .send({});
    expect(replay.status).toBe(200);
    expect(replay.body.status).toBe('IN_PROGRESS');

    const final = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(final.body.statusHistory.map((e: { status: string }) => e.status)).toEqual([
      'DRAFT',
      'DECLARED',
      'MAPPED',
      'PLAN_READY',
      'IN_PROGRESS',
    ]);
    expect(final.body.version).toBe(4);

    // assessors can follow the same assessment end-to-end
    const asAssessor = await request(app).get(`/api/v1/assessments/${id}`).set(auth(assessor));
    expect(asAssessor.body.status).toBe('IN_PROGRESS');
  });
});
