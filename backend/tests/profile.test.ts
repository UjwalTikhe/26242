/**
 * Phase 1 profile tests: contract-valid bootstrap, LWW + version
 * semantics (stale write → 409 with the server copy for client resync).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import { ConflictRes, ProfileRes } from '@sih/contracts';
import { createApp } from '../src/app.js';
import { clearDb, startDb, stopDb } from './helpers/db.js';
import { bearer, loginAssessor, loginWorker } from './helpers/auth.js';

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

const nowIso = () => new Date().toISOString();

const patchProfile = (accessToken: string, body: Record<string, unknown>) =>
  request(app).patch('/api/v1/profile').set('Authorization', `Bearer ${accessToken}`).send(body);

describe('worker profile', () => {
  it('is bootstrapped on first login and contract-valid', async () => {
    const { tokens, user } = await loginWorker(app, { displayName: 'Asha Kumar' });
    const res = await request(app).get('/api/v1/profile').set(bearer(tokens));
    expect(res.status).toBe(200);
    ProfileRes.parse(res.body);
    expect(res.body.fullName).toBe('Asha Kumar');
    expect(res.body.version).toBe(0);
    expect(res.body.region).toEqual({});
    expect(res.body.trades).toEqual([]);
    expect(res.body.yearsExperience).toBe(0);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.id).toBeTruthy();
  });

  it('applies a valid patch and bumps the version', async () => {
    const { tokens } = await loginWorker(app);
    const res = await patchProfile(tokens.accessToken, {
      version: 0,
      clientUpdatedAt: nowIso(),
      patch: {
        fullName: 'Asha Kumari',
        gender: 'female',
        yearsExperience: 4,
        region: { state: 'Bihar', district: 'Patna' },
        trades: ['Electrician'],
        language: 'hi',
      },
    });
    expect(res.status).toBe(200);
    ProfileRes.parse(res.body);
    expect(res.body.version).toBe(1);
    expect(res.body.fullName).toBe('Asha Kumari');
    expect(res.body.gender).toBe('female');
    expect(res.body.yearsExperience).toBe(4);
    expect(res.body.region).toEqual({ state: 'Bihar', district: 'Patna' });
    expect(res.body.trades).toEqual(['Electrician']);
    expect(res.body.language).toBe('hi');
    expect(res.body.clientUpdatedAt).toBeTruthy();
  });

  it('stale version → 409 with server copy; client resyncs and retries', async () => {
    const { tokens } = await loginWorker(app);

    const first = await patchProfile(tokens.accessToken, {
      version: 0,
      clientUpdatedAt: nowIso(),
      patch: { fullName: 'First Write' },
    });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(1);

    // offline device still thinks it has version 0
    const conflict = await patchProfile(tokens.accessToken, {
      version: 0,
      clientUpdatedAt: nowIso(),
      patch: { fullName: 'Stale Write' },
    });
    expect(conflict.status).toBe(409);
    ConflictRes.parse(conflict.body);
    expect(conflict.body.error).toBe('version_conflict');
    expect(conflict.body.server.version).toBe(1);
    expect(conflict.body.server.fullName).toBe('First Write');

    // standard offline resolution: adopt server version, retry
    const retry = await patchProfile(tokens.accessToken, {
      version: conflict.body.server.version,
      clientUpdatedAt: nowIso(),
      patch: { fullName: 'Stale Write' },
    });
    expect(retry.status).toBe(200);
    ProfileRes.parse(retry.body);
    expect(retry.body.version).toBe(2);
    expect(retry.body.fullName).toBe('Stale Write');
  });

  it('rejects out-of-range values with 422 (no partial writes)', async () => {
    const { tokens } = await loginWorker(app);
    const res = await patchProfile(tokens.accessToken, {
      version: 0,
      clientUpdatedAt: nowIso(),
      patch: { yearsExperience: 99 },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');

    // nothing was written
    const check = await request(app).get('/api/v1/profile').set(bearer(tokens));
    expect(check.body.version).toBe(0);
    expect(check.body.yearsExperience).toBe(0);
  });

  it('rejects a malformed clientUpdatedAt with 422', async () => {
    const { tokens } = await loginWorker(app);
    const res = await patchProfile(tokens.accessToken, {
      version: 0,
      clientUpdatedAt: 'not-a-date',
      patch: { fullName: 'X' },
    });
    expect(res.status).toBe(422);
  });

  it('is worker-only: assessors get 403', async () => {
    const { tokens } = await loginAssessor(app);
    const get = await request(app).get('/api/v1/profile').set(bearer(tokens));
    expect(get.status).toBe(403);
    const patch = await patchProfile(tokens.accessToken, {
      version: 0,
      clientUpdatedAt: nowIso(),
      patch: { fullName: 'Nope' },
    });
    expect(patch.status).toBe(403);
  });
});
