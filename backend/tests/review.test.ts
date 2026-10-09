/**
 * Phase 5: scoring engine + assessor review + final decision.
 *
 *   AI_ANALYZED --claim--> UNDER_REVIEW --review--> REVIEWED --decision--> APPROVED|REJECTED
 *                                          \--REASSESS--> round+1 IN_PROGRESS
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { AssessorReview, Assessment, Decision, type Task } from '@sih/contracts';
import { createApp } from '../src/app.js';
import { computeScoreSummary } from '../src/services/scoring.service.js';
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

const declareBody = {
  answers: {
    yearsExperience: 6,
    workTypes: ['house wiring', 'switch board installation'],
    toolsUsed: ['multimeter', 'wire stripper'],
    tasksCanPerform: ['cable termination'],
    sectors: ['electrical'],
  },
  language: 'en',
};

function isObjective(t: Task): boolean {
  return t.type === 'mcq' || t.type === 'tool_identification' || t.type === 'checklist';
}

function answerFor(task: Task): Record<string, string[]> {
  if (task.type === 'checklist') return { checkedItemIds: task.checklistItems.map((i) => i.id) };
  return { selectedOptionIds: [...task.correctIds] };
}

interface Setup {
  worker: Session;
  assessor: Session;
  otherAssessor: Session;
  authorized: Session;
  id: string;
  tasks: Task[];
}

/** Drive create → … → start → answer → submit (inline analysis) → AI_ANALYZED. */
async function driveToAnalyzed(): Promise<Setup> {
  const worker = await loginWorker(app);
  const assessor = await loginAssessor(app);
  const otherAssessor = await loginAssessor(app);
  const authorized = await loginAssessor(app, 'authorized_assessor');

  const created = await request(app)
    .post('/api/v1/assessments')
    .set(auth(worker))
    .send({ tradeHint: 'electrician', language: 'en' });
  expect(created.status).toBe(201);
  const id = created.body.id as string;

  await request(app).post(`/api/v1/assessments/${id}/declaration`).set(auth(worker)).send(declareBody).expect(201);
  await request(app).post(`/api/v1/assessments/${id}/map`).set(auth(worker)).send({}).expect(200);
  await request(app).post(`/api/v1/assessments/${id}/plan`).set(auth(worker)).send({}).expect(201);
  await request(app).post(`/api/v1/assessments/${id}/start`).set(auth(worker)).send({}).expect(200);

  const plan = await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(assessor));
  const tasks = plan.body.tasks as Task[];
  for (const task of tasks.filter(isObjective)) {
    await request(app)
      .post(`/api/v1/assessments/${id}/answers`)
      .set(auth(worker))
      .send({ taskId: task.id, answers: answerFor(task) })
      .expect(200);
  }

  await request(app).post(`/api/v1/assessments/${id}/submit`).set(auth(worker)).send({}).expect(200);
  const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(assessor));
  expect(assessment.body.status).toBe('AI_ANALYZED');

  return { worker, assessor, otherAssessor, authorized, id, tasks };
}

const reviewItems = (tasks: Task[], finalScore: number, acceptAi = false) =>
  tasks.map((t) => ({ taskId: t.id, finalScore, acceptAi }));

const claim = (s: Session, id: string) =>
  request(app).post(`/api/v1/assessments/${id}/review/claim`).set(auth(s)).send({});

const review = (s: Session, id: string, body: Record<string, unknown>) =>
  request(app).post(`/api/v1/assessments/${id}/review`).set(auth(s)).send(body);

const decide = (s: Session, id: string, outcome: 'APPROVED' | 'REJECTED') =>
  request(app).post(`/api/v1/assessments/${id}/decision`).set(auth(s)).send({ outcome });

describe('review claim', () => {
  it('claims AI_ANALYZED → UNDER_REVIEW and rejects a competing claim', async () => {
    const { assessor, otherAssessor, id } = await driveToAnalyzed();

    const first = await claim(assessor, id);
    expect(first.status).toBe(200);
    Assessment.parse(first.body);
    expect(first.body.status).toBe('UNDER_REVIEW');

    // idempotent for the same assessor
    const again = await claim(assessor, id);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('UNDER_REVIEW');

    // another assessor can't steal it
    const stolen = await claim(otherAssessor, id);
    expect(stolen.status).toBe(409);
    expect(stolen.body.error).toBe('already_claimed');
  });

  it('rejects a claim from a worker and from a not-yet-analyzed assessment', async () => {
    const { worker, id } = await driveToAnalyzed();
    await claim(worker, id).expect(403);

    const fresh = await loginWorker(app);
    const freshAssessor = await loginAssessor(app);
    const created = await request(app)
      .post('/api/v1/assessments')
      .set(auth(fresh))
      .send({ tradeHint: 'electrician' });
    const early = await claim(freshAssessor, created.body.id as string);
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('invalid_state');
  });
});

describe('review submission', () => {
  it('records per-task final scores, advances to REVIEWED, and scores the plan', async () => {
    const { worker, assessor, id, tasks } = await driveToAnalyzed();
    await claim(assessor, id).expect(200);

    const res = await review(assessor, id, {
      items: reviewItems(tasks, 0.9),
      outcome: 'REVIEWED',
      overallComment: 'solid work',
    });
    expect(res.status).toBe(200);
    const stored = AssessorReview.parse(res.body);
    expect(stored.assessmentId).toBe(id);
    expect(stored.assessorId).toBe(assessor.user.id);
    expect(stored.items).toHaveLength(tasks.length);
    expect(stored.outcome).toBe('REVIEWED');
    expect(stored.completedAt).toBeTruthy();

    // overrides counted where the AI produced a score; manual where it deferred
    const overridden = stored.items.filter((i) => i.status === 'overridden').length;
    const manual = stored.items.filter((i) => i.status === 'manual').length;
    expect(overridden + manual).toBe(tasks.length);

    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(assessor));
    expect(assessment.body.status).toBe('REVIEWED');

    // GET review is role-scoped and returns the stored record
    const fetched = await request(app).get(`/api/v1/assessments/${id}/review`).set(auth(worker));
    expect(fetched.status).toBe(200);
    AssessorReview.parse(fetched.body);
    expect(fetched.body.id).toBe(stored.id);
    const asOther = await loginWorker(app);
    await request(app).get(`/api/v1/assessments/${id}/review`).set(auth(asOther)).expect(404);

    // scoring engine: all tasks 0.9 → certify at a sensible level
    const summary = await computeScoreSummary(id);
    expect(summary.overallScore).toBeCloseTo(90, 1);
    expect(summary.coverage).toBe(1);
    expect(summary.assessorOverrides).toBe(overridden);
    expect(summary.criticalSafetyPassed).toBe(true);
    expect(summary.recommendation).toBe('certify');
    expect(summary.suggestedNsqfLevel).toBeGreaterThanOrEqual(1);
    expect(summary.currentNsqfLevel).toBe(3);
  });

  it('is replay-safe and requires UNDER_REVIEW + a valid task set', async () => {
    const { assessor, id, tasks } = await driveToAnalyzed();

    // can't review before claiming
    const early = await review(assessor, id, { items: reviewItems(tasks, 0.8), outcome: 'REVIEWED' });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('invalid_state');

    await claim(assessor, id).expect(200);

    // unknown task id → 404 (no review stored yet)
    const unknown = await review(assessor, id, {
      items: [{ taskId: '00000000-0000-4000-8000-000000000000', finalScore: 0.5 }],
      outcome: 'REVIEWED',
    });
    expect(unknown.status).toBe(404);

    const first = await review(assessor, id, { items: reviewItems(tasks, 0.8), outcome: 'REVIEWED' });
    expect(first.status).toBe(200);

    // replay returns the stored review, unchanged
    const replay = await review(assessor, id, { items: reviewItems(tasks, 0.1), outcome: 'REASSESS' });
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(first.body.id);
    expect(replay.body.outcome).toBe('REVIEWED');
  });

  it('fails a critical-safety task and marks the assessment not certified', async () => {
    const { assessor, id, tasks } = await driveToAnalyzed();
    const critical = tasks.find((t) => t.criticalSafety);
    expect(critical).toBeTruthy();

    await claim(assessor, id).expect(200);
    await review(assessor, id, {
      items: tasks.map((t) => ({
        taskId: t.id,
        finalScore: t.id === critical!.id ? 0 : 0.9,
        acceptAi: false,
      })),
      outcome: 'REVIEWED',
    }).expect(200);

    const summary = await computeScoreSummary(id);
    expect(summary.criticalSafetyPassed).toBe(false);
    expect(summary.recommendation).toBe('not_certified');
  });
});

describe('reassessment', () => {
  it('moves to REASSESS, bumps the round, and can be started again', async () => {
    const { worker, assessor, id, tasks } = await driveToAnalyzed();
    await claim(assessor, id).expect(200);

    // REASSESS needs at least one named task
    const missing = await review(assessor, id, { items: reviewItems(tasks, 0.2), outcome: 'REASSESS' });
    expect(missing.status).toBe(422);

    const res = await review(assessor, id, {
      items: reviewItems(tasks, 0.2),
      outcome: 'REASSESS',
      reassessmentTasks: [{ taskId: tasks[0].id, reason: 'retake practical' }],
    });
    expect(res.status).toBe(200);
    const stored = AssessorReview.parse(res.body);
    expect(stored.outcome).toBe('REASSESS');
    expect(stored.reassessmentTasks).toHaveLength(1);

    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('REASSESS');
    expect(assessment.body.round).toBe(2);

    // worker resumes the new round
    const started = await request(app).post(`/api/v1/assessments/${id}/start`).set(auth(worker)).send({});
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('IN_PROGRESS');
    expect(started.body.round).toBe(2);
  });
});

describe('assessor queue', () => {
  it('lists actionable assessments oldest-first and drops them after review', async () => {
    const { assessor, id, tasks } = await driveToAnalyzed();

    const queued = await request(app).get('/api/v1/assessor/queue').set(auth(assessor));
    expect(queued.status).toBe(200);
    expect(queued.body.total).toBe(1);
    expect(queued.body.items[0].id).toBe(id);

    await claim(assessor, id).expect(200);
    await review(assessor, id, { items: reviewItems(tasks, 0.9), outcome: 'REVIEWED' }).expect(200);

    const after = await request(app).get('/api/v1/assessor/queue').set(auth(assessor));
    expect(after.body.total).toBe(0);
  });
});

describe('final decision', () => {
  it('requires an authorized assessor + REVIEWED, then is idempotent and visible', async () => {
    const { worker, assessor, authorized, id, tasks } = await driveToAnalyzed();
    await claim(assessor, id).expect(200);
    await review(assessor, id, { items: reviewItems(tasks, 0.9), outcome: 'REVIEWED' }).expect(200);

    // role gate: plain assessors and workers may not decide
    await decide(assessor, id, 'APPROVED').expect(403);
    await decide(worker, id, 'APPROVED').expect(403);

    const approved = await decide(authorized, id, 'APPROVED');
    expect(approved.status).toBe(200);
    const decision = Decision.parse(approved.body);
    expect(decision.outcome).toBe('APPROVED');
    expect(decision.authorizedAssessorId).toBe(authorized.user.id);

    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(worker));
    expect(assessment.body.status).toBe('APPROVED');

    // replay returns the same decision
    const replay = await decide(authorized, id, 'REJECTED');
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(decision.id);
    expect(replay.body.outcome).toBe('APPROVED');

    const fetched = await request(app).get(`/api/v1/assessments/${id}/decision`).set(auth(worker));
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(decision.id);
  });

  it('rejects a decision before the review is complete', async () => {
    const { authorized, id } = await driveToAnalyzed();
    const res = await decide(authorized, id, 'APPROVED');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('invalid_state');
  });
});
