/**
 * Phase 7: fairness analytics + Socket.IO real-time updates.
 *
 * The realtime tests spin a real HTTP server on an ephemeral port and connect
 * with socket.io-client, so they exercise the auth handshake, the access-checked
 * room join, and an actual event round-trip (not a mock).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import { Server as IOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { FairnessRes, type Task } from '@sih/contracts';
import { createApp } from '../src/app.js';
import { initRealtime } from '../src/realtime/index.js';
import { bearer, loginAssessor, loginWorker, type Session } from './helpers/auth.js';
import { clearDb, startDb, stopDb } from './helpers/db.js';

const app: Express = createApp();

let httpServer: HttpServer;
let ioServer: IOServer;
let baseUrl: string;
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await startDb();
  httpServer = createServer(app);
  ioServer = initRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  for (const s of sockets) s.close();
  await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  await stopDb();
});
beforeEach(async () => {
  await clearDb();
});

const auth = (s: Session) => bearer(s.tokens);

/* ------------------------------------------------------------------ */
/* Realtime helpers                                                    */
/* ------------------------------------------------------------------ */

function connect(token?: string): ClientSocket {
  const socket = ioClient(baseUrl, {
    path: '/realtime',
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  return socket;
}

function waitFor<T>(socket: ClientSocket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function waitConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}

function subscribe(socket: ClientSocket, assessmentId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => socket.emit('assessment:subscribe', { assessmentId }, resolve));
}

/* ------------------------------------------------------------------ */
/* Pipeline helper (through to the final decision)                     */
/* ------------------------------------------------------------------ */

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

const isObjective = (t: Task) =>
  t.type === 'mcq' || t.type === 'tool_identification' || t.type === 'checklist';

const answerFor = (task: Task): Record<string, string[]> =>
  task.type === 'checklist'
    ? { checkedItemIds: task.checklistItems.map((i) => i.id) }
    : { selectedOptionIds: [...task.correctIds] };

interface PipelineOpts {
  score: number;
  outcome: 'APPROVED' | 'REJECTED';
  gender?: string;
  region?: string;
  language?: string;
}

async function fullPipeline(opts: PipelineOpts): Promise<{ id: string; worker: Session }> {
  const worker = await loginWorker(app);

  const patch: Record<string, unknown> = {};
  if (opts.gender) patch.gender = opts.gender;
  if (opts.region) patch.region = { state: opts.region };
  if (Object.keys(patch).length > 0) {
    const res = await request(app)
      .patch('/api/v1/profile')
      .set(auth(worker))
      .send({ version: 0, clientUpdatedAt: new Date().toISOString(), patch });
    expect(res.status).toBe(200);
  }

  const created = await request(app)
    .post('/api/v1/assessments')
    .set(auth(worker))
    .send({ tradeHint: 'electrician', language: opts.language ?? 'en' });
  expect(created.status).toBe(201);
  const id = created.body.id as string;

  await request(app).post(`/api/v1/assessments/${id}/declaration`).set(auth(worker)).send(declareBody).expect(201);
  await request(app).post(`/api/v1/assessments/${id}/map`).set(auth(worker)).send({}).expect(200);
  await request(app).post(`/api/v1/assessments/${id}/plan`).set(auth(worker)).send({}).expect(201);
  await request(app).post(`/api/v1/assessments/${id}/start`).set(auth(worker)).send({}).expect(200);

  const assessor = await loginAssessor(app);
  const authorized = await loginAssessor(app, 'authorized_assessor');
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
  await request(app).post(`/api/v1/assessments/${id}/review/claim`).set(auth(assessor)).send({}).expect(200);
  await request(app)
    .post(`/api/v1/assessments/${id}/review`)
    .set(auth(assessor))
    .send({ items: tasks.map((t) => ({ taskId: t.id, finalScore: opts.score, acceptAi: false })), outcome: 'REVIEWED' })
    .expect(200);
  await request(app)
    .post(`/api/v1/assessments/${id}/decision`)
    .set(auth(authorized))
    .send({ outcome: opts.outcome })
    .expect(200);

  return { id, worker };
}

/* ------------------------------------------------------------------ */

describe('fairness analytics', () => {
  it('buckets outcomes by language/gender/region and is assessor-only', async () => {
    await fullPipeline({ score: 0.9, outcome: 'APPROVED', gender: 'male', region: 'Karnataka' });
    await fullPipeline({ score: 0.1, outcome: 'REJECTED', gender: 'female', region: 'Bihar' });

    const assessor = await loginAssessor(app);
    const res = await request(app).get('/api/v1/admin/fairness').set(auth(assessor));
    expect(res.status).toBe(200);
    const data = FairnessRes.parse(res.body);

    expect(data.buckets.length).toBeGreaterThan(0);
    expect(new Set(data.buckets.map((b) => b.dimension))).toEqual(
      new Set(['language', 'gender', 'region']),
    );
    for (const b of data.buckets) {
      expect(b.count).toBeGreaterThan(0);
      expect(b.avgScore).toBeGreaterThanOrEqual(0);
      expect(b.avgScore).toBeLessThanOrEqual(100);
      expect(b.approvalRate).toBeGreaterThanOrEqual(0);
      expect(b.approvalRate).toBeLessThanOrEqual(1);
    }
    expect(data.buckets.some((b) => b.dimension === 'gender' && b.value === 'male')).toBe(true);
    expect(data.buckets.some((b) => b.dimension === 'gender' && b.value === 'female')).toBe(true);
    expect(data.buckets.some((b) => b.dimension === 'region' && b.value === 'Karnataka')).toBe(true);

    // workers cannot read admin stats; anonymous is rejected
    const worker = await loginWorker(app);
    await request(app).get('/api/v1/admin/fairness').set(auth(worker)).expect(403);
    await request(app).get('/api/v1/admin/fairness').expect(401);
  });
});

describe('realtime (socket.io)', () => {
  it('rejects a connection without a valid access token', async () => {
    const socket = connect();
    const err = await waitFor<Error>(socket, 'connect_error');
    expect(String(err.message)).toMatch(/unauthorized/i);
    expect(socket.connected).toBe(false);
  });

  it('pushes assessment status to a subscribed owner', async () => {
    const worker = await loginWorker(app);
    const created = await request(app)
      .post('/api/v1/assessments')
      .set(auth(worker))
      .send({ tradeHint: 'electrician', language: 'en' });
    const id = created.body.id as string;

    const socket = connect(worker.tokens.accessToken);
    await waitConnect(socket);
    expect(await subscribe(socket, id)).toEqual({ ok: true });

    const eventP = waitFor<{ assessmentId: string; status: string }>(socket, 'assessment:status');
    await request(app).post(`/api/v1/assessments/${id}/declaration`).set(auth(worker)).send(declareBody).expect(201);

    const event = await eventP;
    expect(event.assessmentId).toBe(id);
    expect(event.status).toBe('DECLARED');
  });

  it('blocks a worker from watching another worker’s assessment but allows an assessor', async () => {
    const owner = await loginWorker(app);
    const created = await request(app)
      .post('/api/v1/assessments')
      .set(auth(owner))
      .send({ tradeHint: 'electrician', language: 'en' });
    const id = created.body.id as string;

    const intruder = await loginWorker(app);
    const intruderSocket = connect(intruder.tokens.accessToken);
    await waitConnect(intruderSocket);
    expect(await subscribe(intruderSocket, id)).toEqual({ ok: false, error: 'forbidden' });

    const assessor = await loginAssessor(app);
    const assessorSocket = connect(assessor.tokens.accessToken);
    await waitConnect(assessorSocket);
    expect(await subscribe(assessorSocket, id)).toEqual({ ok: true });
  });
});
