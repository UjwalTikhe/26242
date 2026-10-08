import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { startDb, stopDb } from './helpers/db.js';

const app = createApp();

beforeAll(async () => {
  await startDb();
});
afterAll(async () => {
  await stopDb();
});

describe('health', () => {
  it('GET /health returns 200 with service info and live dependency checks', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('sih26242-rpl-api');
    expect(res.body.checks.mongo.status).toBe('up');
    expect(res.body.checks.runtime.status).toBe('up');
  });

  it('unknown route returns 404 JSON', async () => {
    const res = await request(app).get('/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
