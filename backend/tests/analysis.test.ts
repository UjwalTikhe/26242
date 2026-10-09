/**
 * Phase 4: submit → AI analysis pipeline.
 *
 * With AI_MODE=mock (no provider keys) the pipeline must still be complete and
 * contract-shaped: objective tasks graded from the answer key, evidence tasks
 * compliance-checked and honestly routed to a human, narration keyword-scored
 * from a client transcript. Everything deterministic, no network.
 */
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import {
  AIAnalysis,
  AnalysisStatusRes,
  Assessment,
  EvidenceListRes,
  TaskResponse,
  TradePack,
  type Task,
} from '@sih/contracts';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
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
const nowIso = () => new Date().toISOString();

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

/** Drive create → declare → map → plan → start; return assessment id + answer-keyed plan. */
async function driveToInProgress(): Promise<{ id: string; tasks: Task[] }> {
  const worker = await loginWorker(app);
  const assessor = await loginAssessor(app);

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
  expect(plan.status).toBe(200);
  return { id, tasks: plan.body.tasks as Task[] };
}

/** Answer an objective task correctly (or deliberately wrong) from the key. */
function objectiveAnswers(task: Task, correct = true): Record<string, string[]> {
  if (task.type === 'checklist') {
    return { checkedItemIds: correct ? task.checklistItems.map((i) => i.id) : [] };
  }
  // mcq / tool_identification
  return { selectedOptionIds: correct ? [...task.correctIds] : [] };
}

function isObjective(t: Task): boolean {
  return t.type === 'mcq' || t.type === 'tool_identification' || t.type === 'checklist';
}
function isPractical(t: Task): boolean {
  return t.type === 'practical_photo' || t.type === 'practical_video';
}

async function answerAllObjective(s: Session, id: string, tasks: Task[]): Promise<void> {
  for (const task of tasks.filter(isObjective)) {
    const res = await request(app)
      .post(`/api/v1/assessments/${id}/answers`)
      .set(auth(s))
      .send({ taskId: task.id, answers: objectiveAnswers(task) });
    expect(res.status).toBe(200);
  }
}

/** Stage real bytes + register evidence for every evidence-bearing task. */
async function uploadEvidenceForAll(s: Session, id: string, tasks: Task[], pack: TradePack): Promise<void> {
  const pcKeywords = new Map(
    pack.nos.flatMap((n) => n.performanceCriteria).map((pc) => [pc.id, pc.keywords]),
  );
  const gps = { lat: 19.07, lng: 72.87, source: 'gps' as const };

  for (const task of tasks) {
    if (isObjective(task)) continue;
    const kind = task.type === 'narration' ? 'audio' : task.type === 'practical_video' ? 'video' : 'photo';
    const key = `uploads/${id}/${task.id}.bin`;
    const body = Buffer.from(`evidence for ${task.type} ${task.id}`);
    await getStorage().put(key, body);

    const narrationText =
      task.type === 'narration'
        ? task.criteriaRefs.flatMap((ref) => pcKeywords.get(ref) ?? []).join(' ')
        : undefined;

    const res = await request(app)
      .post(`/api/v1/assessments/${id}/evidence`)
      .set(auth(s))
      .send({
        taskId: task.id,
        kind,
        sizeBytes: body.length,
        mimeType: kind === 'audio' ? 'audio/wav' : kind === 'video' ? 'video/mp4' : 'image/jpeg',
        capturedAt: nowIso(),
        gps,
        language: 'en',
        storageKey: key,
        ...(narrationText ? { narrationText, narrationSource: 'client' as const } : {}),
      });
    expect(res.status).toBe(201);
  }
}

async function analyzeFlow(): Promise<{
  worker: Session;
  assessor: Session;
  id: string;
  tasks: Task[];
  pack: TradePack;
}> {
  const worker = await loginWorker(app);
  const assessor = await loginAssessor(app);
  const created = await request(app)
    .post('/api/v1/assessments')
    .set(auth(worker))
    .send({ tradeHint: 'electrician', language: 'en' });
  const id = created.body.id as string;
  await request(app).post(`/api/v1/assessments/${id}/declaration`).set(auth(worker)).send(declareBody).expect(201);
  await request(app).post(`/api/v1/assessments/${id}/map`).set(auth(worker)).send({}).expect(200);
  await request(app).post(`/api/v1/assessments/${id}/plan`).set(auth(worker)).send({}).expect(201);
  await request(app).post(`/api/v1/assessments/${id}/start`).set(auth(worker)).send({}).expect(200);

  const plan = await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(assessor));
  const packRes = await request(app).get('/api/v1/trades/electrician');
  TradePack.parse(packRes.body);
  return { worker, assessor, id, tasks: plan.body.tasks as Task[], pack: packRes.body as TradePack };
}

const submit = (s: Session, id: string) =>
  request(app).post(`/api/v1/assessments/${id}/submit`).set(auth(s)).send({});

describe('submit → analysis happy path', () => {
  it('grades objective tasks, routes evidence tasks to humans, and flips status to AI_ANALYZED', async () => {
    const { worker, assessor, id, tasks, pack } = await analyzeFlow();

    await answerAllObjective(worker, id, tasks);
    await uploadEvidenceForAll(worker, id, tasks, pack);

    const submitted = await submit(worker, id);
    expect(submitted.status).toBe(200);
    Assessment.parse(submitted.body);
    expect(submitted.body.status).toBe('SUBMITTED'); // snapshot before the inline pipeline runs

    // analysis ran inline during submit
    const statusRes = await request(app)
      .get(`/api/v1/assessments/${id}/analysis/status`)
      .set(auth(worker));
    expect(statusRes.status).toBe(200);
    AnalysisStatusRes.parse(statusRes.body);
    expect(statusRes.body.state).toBe('done');

    const analysisRes = await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(worker));
    expect(analysisRes.status).toBe(200);
    const analysis = AIAnalysis.parse(analysisRes.body);
    expect(analysis.mode).toBe('fallback');
    expect(analysis.items).toHaveLength(tasks.length);
    expect(analysis.pipelineVersion).toBeTruthy();

    // objective tasks: deterministic 'auto', perfect score
    const objectiveIds = new Set(tasks.filter(isObjective).map((t) => t.id));
    const objectiveItems = analysis.items.filter((i) => objectiveIds.has(i.taskId));
    expect(objectiveItems.length).toBeGreaterThan(0);
    expect(objectiveItems.every((i) => i.routing === 'auto')).toBe(true);
    expect(objectiveItems.every((i) => i.aiScore === 1)).toBe(true);
    expect(objectiveItems.every((i) => i.confidence === 1)).toBe(true);

    // practical tasks: no vision in mock mode → human, null score
    const practicalIds = new Set(tasks.filter(isPractical).map((t) => t.id));
    const practicalItems = analysis.items.filter((i) => practicalIds.has(i.taskId));
    expect(practicalItems.length).toBeGreaterThan(0);
    expect(practicalItems.every((i) => i.routing === 'human_required' && i.aiScore === null)).toBe(true);

    // narration with a client transcript → keyword scored, present in narration[]
    expect(analysis.narration.length).toBeGreaterThan(0);
    expect(analysis.narration[0].keywordHits.length).toBeGreaterThan(0);
    expect(analysis.narration[0].transcript.length).toBeGreaterThan(0);

    // pending human work lists the deferred tasks
    expect(analysis.pendingHumanTasks.length).toBeGreaterThanOrEqual(practicalItems.length);
    expect(analysis.safetySummary.issues).toBeGreaterThanOrEqual(0);

    // evidence lifecycle advanced to analyzed
    const evidence = await request(app).get(`/api/v1/assessments/${id}/evidence`).set(auth(worker));
    const evidenceList = EvidenceListRes.parse(evidence.body);
    expect(evidenceList.items.length).toBeGreaterThan(0);
    expect(evidenceList.items.every((e) => e.status === 'analyzed')).toBe(true);

    // autoScore persisted on every objective TaskResponse
    const answers = await request(app).get(`/api/v1/assessments/${id}/answers`).set(auth(worker));
    for (const response of answers.body.items as Array<{ taskId: string; autoScore?: { score: number } }>) {
      if (objectiveIds.has(response.taskId)) {
        expect(response.autoScore?.score).toBe(1);
      }
    }

    // assessment moved on to AI_ANALYZED
    const assessment = await request(app).get(`/api/v1/assessments/${id}`).set(auth(assessor));
    expect(assessment.body.status).toBe('AI_ANALYZED');
  });
});

describe('critical-safety routing', () => {
  it('forces a failed critical-safety task to a human with a critical flag', async () => {
    const { worker, assessor, id, tasks, pack } = await analyzeFlow();

    const criticalObjective = tasks.find((t) => isObjective(t) && t.criticalSafety);
    expect(criticalObjective, 'electrician pack should have a critical objective task').toBeTruthy();

    for (const task of tasks.filter(isObjective)) {
      const correct = task.id !== criticalObjective!.id;
      const res = await request(app)
        .post(`/api/v1/assessments/${id}/answers`)
        .set(auth(worker))
        .send({ taskId: task.id, answers: objectiveAnswers(task, correct) });
      expect(res.status).toBe(200);
    }
    await uploadEvidenceForAll(worker, id, tasks, pack);
    await submit(worker, id).expect(200);

    const analysisRes = await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(assessor));
    const analysis = AIAnalysis.parse(analysisRes.body);
    const item = analysis.items.find((i) => i.taskId === criticalObjective!.id);
    expect(item).toBeTruthy();
    expect(item!.routing).toBe('human_required');
    expect(item!.requiresHuman).toBe(true);
    expect(item!.aiScore).toBe(0);
    expect(item!.flags.some((f) => f.kind === 'safety_issue' && f.severity === 'critical')).toBe(true);
    expect(analysis.safetySummary.criticalFlags).toBeGreaterThanOrEqual(1);
  });
});

describe('missing evidence', () => {
  it('defers practical tasks with a process flag when no media was uploaded', async () => {
    const { worker, id, tasks } = await analyzeFlow();
    await answerAllObjective(worker, id, tasks);
    // deliberately upload nothing
    await submit(worker, id).expect(200);

    const analysis = AIAnalysis.parse(
      (await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(worker))).body,
    );
    const practicalIds = new Set(tasks.filter(isPractical).map((t) => t.id));
    const items = analysis.items.filter((i) => practicalIds.has(i.taskId));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.routing).toBe('human_required');
      expect(item.aiScore).toBeNull();
      expect(item.note).toContain('No evidence');
      expect(item.flags.some((f) => f.kind === 'process')).toBe(true);
    }
  });
});

describe('submit guards + idempotency', () => {
  it('requires auth, ownership, and the IN_PROGRESS state', async () => {
    const { worker, id } = await analyzeFlow();
    const other = await loginWorker(app);

    await request(app).post(`/api/v1/assessments/${id}/submit`).send({}).expect(401);
    await submit(other, id).expect(404);

    // from PLAN_READY (not started) the transition is invalid
    const fresh = await loginWorker(app);
    const created = await request(app)
      .post('/api/v1/assessments')
      .set(auth(fresh))
      .send({ tradeHint: 'electrician' });
    const freshId = created.body.id as string;
    await request(app).post(`/api/v1/assessments/${freshId}/declaration`).set(auth(fresh)).send(declareBody);
    await request(app).post(`/api/v1/assessments/${freshId}/map`).set(auth(fresh)).send({});
    await request(app).post(`/api/v1/assessments/${freshId}/plan`).set(auth(fresh)).send({});
    const early = await submit(fresh, freshId);
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('invalid_transition');
  });

  it('is replay-safe: a second submit does not re-run or duplicate analysis', async () => {
    const { worker, id, tasks, pack } = await analyzeFlow();
    await answerAllObjective(worker, id, tasks);
    await uploadEvidenceForAll(worker, id, tasks, pack);

    await submit(worker, id).expect(200);
    const first = AIAnalysis.parse(
      (await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(worker))).body,
    );

    const replay = await submit(worker, id);
    expect(replay.status).toBe(200);
    // already AI_ANALYZED → returns the current record untouched
    expect(replay.body.status).toBe('AI_ANALYZED');

    const second = AIAnalysis.parse(
      (await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(worker))).body,
    );
    expect(second.id).toBe(first.id);
    expect(second.computedAt).toBe(first.computedAt);
  });
});

describe('analysis status + scoping', () => {
  it('reports none before submit and scopes visibility by role', async () => {
    const { worker, assessor, id } = await analyzeFlow();
    const other = await loginWorker(app);

    const before = await request(app)
      .get(`/api/v1/assessments/${id}/analysis/status`)
      .set(auth(worker));
    expect(before.status).toBe(200);
    expect(before.body.state).toBe('none');

    await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(worker)).expect(404);

    // answer objectives so submit has something to grade
    const plan = await request(app).get(`/api/v1/assessments/${id}/plan`).set(auth(assessor));
    const tasks = plan.body.tasks as Task[];
    await answerAllObjective(worker, id, tasks);
    await submit(worker, id).expect(200);

    await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(assessor)).expect(200);
    await request(app).get(`/api/v1/assessments/${id}/analysis`).set(auth(other)).expect(404);
    await request(app).get(`/api/v1/assessments/${id}/analysis`).expect(401);
  });
});

describe('contract conformance', () => {
  it('every TaskResponse with an autoScore parses against the contract', async () => {
    const { worker, id, tasks } = await analyzeFlow();
    await answerAllObjective(worker, id, tasks);
    await submit(worker, id).expect(200);

    const answers = await request(app).get(`/api/v1/assessments/${id}/answers`).set(auth(worker));
    expect(answers.body.items.length).toBeGreaterThan(0);
    for (const item of answers.body.items) {
      TaskResponse.parse(item);
    }

    // the analysis change is visible on the sync feed
    const pulled = await request(app)
      .get('/api/v1/sync/pull?since=0&limit=100')
      .set(auth(worker));
    expect(pulled.status).toBe(200);
    expect(
      (pulled.body.changes as Array<{ entity: string }>).some((c) => c.entity === 'analysis'),
    ).toBe(true);
  });
});
