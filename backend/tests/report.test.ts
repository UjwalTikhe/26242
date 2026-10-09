/**
 * Phase 6: competency report, certificate PDF + QR, public verification, and
 * the tamper-evident audit chain.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import {
  AuditLogRes,
  Certificate as CertificateSchema,
  Decision,
  ReportRes,
  VerifyRes,
  type Certificate as CertificateType,
  type Task,
} from '@sih/contracts';
import { createApp } from '../src/app.js';
import { AuditLog } from '../src/models/audit.models.js';
import { Certificate } from '../src/models/report.models.js';
import { verifyAuditChain } from '../src/services/audit.service.js';
import { toApi } from '../src/utils/toApi.js';
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

const isObjective = (t: Task) =>
  t.type === 'mcq' || t.type === 'tool_identification' || t.type === 'checklist';

const answerFor = (task: Task): Record<string, string[]> =>
  task.type === 'checklist'
    ? { checkedItemIds: task.checklistItems.map((i) => i.id) }
    : { selectedOptionIds: [...task.correctIds] };

interface Setup {
  worker: Session;
  assessor: Session;
  authorized: Session;
  id: string;
  tasks: Task[];
}

/** Drive create → … → REVIEWED (claim + review), leaving the decision pending. */
async function driveToReviewed(finalScore: number): Promise<Setup> {
  const worker = await loginWorker(app);
  const assessor = await loginAssessor(app);
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

  await request(app).post(`/api/v1/assessments/${id}/review/claim`).set(auth(assessor)).send({}).expect(200);
  await request(app)
    .post(`/api/v1/assessments/${id}/review`)
    .set(auth(assessor))
    .send({ items: tasks.map((t) => ({ taskId: t.id, finalScore, acceptAi: false })), outcome: 'REVIEWED' })
    .expect(200);

  return { worker, assessor, authorized, id, tasks };
}

const decide = (s: Session, id: string, outcome: 'APPROVED' | 'REJECTED') =>
  request(app).post(`/api/v1/assessments/${id}/decision`).set(auth(s)).send({ outcome });

const binaryParser = (res: NodeJS.ReadableStream, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('competency report', () => {
  it('is generated at decision time and reflects the reviewed scores', async () => {
    const { worker, assessor, authorized, id } = await driveToReviewed(0.9);

    // not generated until the decision is recorded
    await request(app).get(`/api/v1/assessments/${id}/report`).set(auth(worker)).expect(404);

    await decide(authorized, id, 'APPROVED').expect(200);

    const res = await request(app).get(`/api/v1/assessments/${id}/report`).set(auth(worker));
    expect(res.status).toBe(200);
    const report = ReportRes.parse(res.body);
    expect(report.assessmentId).toBe(id);
    expect(report.overallScore).toBeCloseTo(90, 1);
    expect(report.recommendation).toBe('certify');
    expect(report.criticalSafetyPassed).toBe(true);
    expect(report.suggestedNsqfLevel).toBeGreaterThanOrEqual(1);

    // assessor can read it too; another worker cannot; anonymous is rejected
    await request(app).get(`/api/v1/assessments/${id}/report`).set(auth(assessor)).expect(200);
    const other = await loginWorker(app);
    await request(app).get(`/api/v1/assessments/${id}/report`).set(auth(other)).expect(404);
    await request(app).get(`/api/v1/assessments/${id}/report`).expect(401);
  });

  it('recommends reassessment when the overall stays below the pass mark', async () => {
    const { authorized, id } = await driveToReviewed(0.2);
    await decide(authorized, id, 'REJECTED').expect(200);
    const report = ReportRes.parse(
      (await request(app).get(`/api/v1/assessments/${id}/report`).set(auth(authorized))).body,
    );
    expect(report.criticalSafetyPassed).toBe(false); // a critical task at 0.2 < floor
    expect(report.recommendation).toBe('not_certified');
    expect(report.bridgeTraining.length).toBeGreaterThan(0);
  });
});

describe('certificate + public verification', () => {
  it('issues a certificate on APPROVED, renders a PDF, and verifies publicly', async () => {
    const { worker, authorized, id } = await driveToReviewed(0.9);
    const decision = Decision.parse((await decide(authorized, id, 'APPROVED').expect(200)).body);
    expect(decision.certificateId).toBeTruthy();

    const cert = (await Certificate.findById(decision.certificateId).lean()) as CertificateType | null;
    expect(cert).toBeTruthy();
    expect(cert!.certificateNo).toMatch(/^SIH-RPL-\d{4}-[0-9A-F]{8}$/);
    expect(cert!.nsqfLevel).toBeGreaterThanOrEqual(1);
    CertificateSchema.parse(toApi(cert));

    // PDF by id (worker owns it)
    const pdf = await request(app)
      .get(`/api/v1/certificates/${decision.certificateId}/pdf`)
      .set(auth(worker))
      .buffer(true)
      .parse(binaryParser);
    expect(pdf.status).toBe(200);
    expect(String(pdf.headers['content-type'])).toMatch(/application\/pdf/);
    expect(pdf.body.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.body.length).toBeGreaterThan(1000);

    // another worker cannot fetch it; anonymous is rejected
    const other = await loginWorker(app);
    await request(app).get(`/api/v1/certificates/${decision.certificateId}/pdf`).set(auth(other)).expect(404);
    await request(app).get(`/api/v1/certificates/${decision.certificateId}/pdf`).expect(401);

    // public verification (no auth)
    const verify = await request(app).get(`/api/v1/verify/${cert!.certificateNo}`);
    expect(verify.status).toBe(200);
    const payload = VerifyRes.parse(verify.body);
    expect(payload.valid).toBe(true);
    expect(payload.holder?.nsqfLevel).toBe(cert!.nsqfLevel);
    expect(payload.assessment?.overallScore).toBeCloseTo(90, 1);
    expect(payload.assessment?.status).toBe('APPROVED');

    // unknown certificate number
    const missing = VerifyRes.parse((await request(app).get('/api/v1/verify/NOPE-0000-DEADBEEF')).body);
    expect(missing.valid).toBe(false);
    expect(missing.reason).toBe('not_found');
  });

  it('issues no certificate on REJECTED', async () => {
    const { authorized, worker, id } = await driveToReviewed(0.2);
    const decision = Decision.parse((await decide(authorized, id, 'REJECTED').expect(200)).body);
    expect(decision.certificateId).toBeUndefined();
    expect(await Certificate.findOne({ assessmentId: id }).lean()).toBeNull();
    const audit = await request(app).get(`/api/v1/assessments/${id}/audit`).set(auth(worker));
    expect(audit.status).toBe(403); // audit is assessor-scoped
  });
});

describe('audit chain', () => {
  it('records the workflow, is ordered, and verifies; tampering is detected', async () => {
    const { worker, assessor, authorized, id } = await driveToReviewed(0.9);
    await decide(authorized, id, 'APPROVED').expect(200);

    const res = await request(app).get(`/api/v1/assessments/${id}/audit`).set(auth(assessor));
    expect(res.status).toBe(200);
    const page = AuditLogRes.parse(res.body);
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.map((e) => e.seq)).toEqual([...page.items].map((_, i) => i + 1));
    const actions = page.items.map((e) => e.action);
    expect(actions).toContain('created');
    expect(actions).toContain('approved');
    expect(actions).toContain('issued'); // certificate
    expect(page.items.every((e) => /^[0-9a-f]{64}$/.test(e.hash))).toBe(true);

    // workers cannot read the audit trail
    await request(app).get(`/api/v1/assessments/${id}/audit`).set(auth(worker)).expect(403);

    const before = await verifyAuditChain(id);
    expect(before.valid).toBe(true);
    expect(before.entries).toBe(page.total);

    // tamper with an entry → chain verification fails
    await AuditLog.updateOne({ scope: id, seq: 2 }, { $set: { data: { tampered: true } } });
    const after = await verifyAuditChain(id);
    expect(after.valid).toBe(false);
    expect(after.brokenAt).toBe(2);
  });
});

describe('public verifier landing page', () => {
  it('serves a mobile HTML page for a valid certificate, JSON via ?format=json, and 404 for unknown', async () => {
    const { authorized, id } = await driveToReviewed(0.9);
    const decision = Decision.parse((await decide(authorized, id, 'APPROVED').expect(200)).body);
    const cert = (await Certificate.findById(decision.certificateId).lean()) as CertificateType | null;
    expect(cert).toBeTruthy();

    // the QR URL (PUBLIC_BASE_URL + /verify/<no>) renders a human page
    const page = await request(app).get(`/verify/${cert!.certificateNo}`);
    expect(page.status).toBe(200);
    expect(String(page.headers['content-type'])).toMatch(/text\/html/);
    expect(page.headers['cache-control']).toMatch(/no-store/);
    expect(page.text).toContain('Valid certificate');
    expect(page.text).toContain(cert!.certificateNo);
    expect(page.text).toContain(cert!.holderName);
    expect(page.text).toContain(`L${cert!.nsqfLevel}`);

    // same endpoint negotiates JSON for app/PWA consumers
    const json = await request(app).get(`/verify/${cert!.certificateNo}?format=json`);
    expect(json.status).toBe(200);
    expect(VerifyRes.parse(json.body).valid).toBe(true);

    // the Accept header alone is enough
    const viaAccept = await request(app)
      .get(`/verify/${cert!.certificateNo}`)
      .set('Accept', 'application/json');
    expect(VerifyRes.parse(viaAccept.body).valid).toBe(true);

    // search / help page and the no-JS query-param form flow
    const search = await request(app).get('/verify');
    expect(search.status).toBe(200);
    expect(search.text).toContain('Verify a certificate');
    const viaQuery = await request(app).get(`/verify?certificateNo=${cert!.certificateNo}`);
    expect(viaQuery.status).toBe(200);
    expect(viaQuery.text).toContain('Valid certificate');

    // unknown number → friendly 404 page
    const missing = await request(app).get('/verify/NOPE-0000-DEADBEEF');
    expect(missing.status).toBe(404);
    expect(missing.text).toContain('No matching certificate');
    expect(missing.text).toContain('NOPE-0000-DEADBEEF');

    // ...and JSON negotiation reports the same not-valid result
    const missingJson = await request(app).get('/verify/NOPE-0000-DEADBEEF?format=json');
    expect(missingJson.status).toBe(404);
    expect(VerifyRes.parse(missingJson.body).valid).toBe(false);

    // revoked certificate → valid page, clearly marked
    await Certificate.updateOne({ _id: decision.certificateId }, { $set: { revoked: true } });
    const revoked = await request(app).get(`/verify/${cert!.certificateNo}`);
    expect(revoked.status).toBe(200);
    expect(revoked.text).toContain('revoked');
  });
});

