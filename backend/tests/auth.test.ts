/**
 * Phase 1 auth tests: phone-OTP worker flow, assessor email+password,
 * refresh rotation, and role guards (guards run BEFORE handlers, so stub
 * routes still enforce auth).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import {
  AuthSession,
  MeRes,
  RequestOtpRes,
  VerifyOtpRes,
} from '@sih/contracts';
import { createApp } from '../src/app.js';
import { clearDb, startDb, stopDb } from './helpers/db.js';
import { bearer, loginAssessor, loginWorker, nextPhone } from './helpers/auth.js';

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

const reqOtp = (phone: string) => request(app).post('/api/v1/auth/otp/request').send({ phone });
const reqVerify = (body: Record<string, unknown>) =>
  request(app).post('/api/v1/auth/otp/verify').send(body);

describe('phone OTP (worker login)', () => {
  it('request returns sent + debug code in non-production (mock provider)', async () => {
    const res = await reqOtp(nextPhone());
    expect(res.status).toBe(200);
    RequestOtpRes.parse(res.body);
    expect(res.body.sent).toBe(true);
    expect(res.body.debugCode).toBe('123456');
    expect(res.body.expiresInSec).toBeGreaterThan(0);
  });

  it('rejects malformed phone numbers with 422 validation_error', async () => {
    const res = await reqOtp('not-a-phone');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
  });

  it('rate-limits repeat OTP requests for the same phone (429)', async () => {
    const phone = nextPhone();
    await reqOtp(phone).expect(200);
    const second = await reqOtp(phone);
    expect(second.status).toBe(429);
    expect(second.body.error).toBe('rate_limited');
  });

  it('rejects a wrong code, then accepts the right one (attempt accounting)', async () => {
    const phone = nextPhone();
    await reqOtp(phone).expect(200);

    const wrong = await reqVerify({ phone, code: '000000' });
    expect(wrong.status).toBe(401);

    const ok = await reqVerify({
      phone,
      code: '123456',
      deviceId: 'device-1',
      displayName: 'Asha Kumar',
      language: 'hi',
    });
    expect(ok.status).toBe(200);
    VerifyOtpRes.parse(ok.body);
    expect(ok.body.user.role).toBe('worker');
    expect(ok.body.user.displayName).toBe('Asha Kumar');
    expect(ok.body.user.language).toBe('hi');
    expect(ok.body.tokens.accessToken.length).toBeGreaterThan(20);
    expect(ok.body.tokens.expiresInSec).toBeGreaterThan(0);
  });

  it('codes are single-use', async () => {
    const phone = nextPhone();
    await reqOtp(phone).expect(200);
    await reqVerify({ phone, code: '123456' }).expect(200);

    const replay = await reqVerify({ phone, code: '123456' });
    expect(replay.status).toBe(401);
    expect(replay.body.message).toMatch(/active OTP/i);
  });

  it('GET /auth/me returns the user and bootstrapped profile', async () => {
    const { tokens, user } = await loginWorker(app, { displayName: 'Asha Kumar' });
    const me = await request(app).get('/api/v1/auth/me').set(bearer(tokens));
    expect(me.status).toBe(200);
    MeRes.parse(me.body);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.profile).toBeDefined();
    expect(me.body.profile?.fullName).toBe('Asha Kumar');
    expect(me.body.user).not.toHaveProperty('passwordHash');
  });
});

describe('assessor email+password', () => {
  it('registers, refuses duplicate email, logs in, rejects bad password', async () => {
    const reg = await request(app).post('/api/v1/auth/assessor/register').send({
      email: 'assessor@sih.test',
      password: 'Password123',
      displayName: 'Assessor One',
      role: 'assessor',
    });
    expect(reg.status).toBe(200);
    AuthSession.parse(reg.body);
    expect(reg.body.user.role).toBe('assessor');
    expect(reg.body.user.email).toBe('assessor@sih.test');

    const dup = await request(app).post('/api/v1/auth/assessor/register').send({
      email: 'ASSessor@sih.test', // case-insensitive uniqueness
      password: 'Password123',
      displayName: 'Assessor One',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('email_taken');

    const badLogin = await request(app).post('/api/v1/auth/assessor/login').send({
      email: 'assessor@sih.test',
      password: 'wrong-password',
    });
    expect(badLogin.status).toBe(401);

    const goodLogin = await request(app).post('/api/v1/auth/assessor/login').send({
      email: 'assessor@sih.test',
      password: 'Password123',
    });
    expect(goodLogin.status).toBe(200);
    AuthSession.parse(goodLogin.body);

    // no password hash ever leaks
    const me = await request(app).get('/api/v1/auth/me').set(bearer(goodLogin.body.tokens));
    expect(me.status).toBe(200);
    MeRes.parse(me.body);
    expect(me.body.user).not.toHaveProperty('passwordHash');
    expect(me.body.profile).toBeUndefined();
  });

  it('rejects weak registration payloads with 422', async () => {
    const res = await request(app).post('/api/v1/auth/assessor/register').send({
      email: 'not-an-email',
      password: 'short',
      displayName: '',
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_error');
  });
});

describe('refresh rotation + logout', () => {
  it('rotates refresh tokens, revokes old ones, logout kills the session', async () => {
    const { tokens } = await loginWorker(app);

    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(r1.status).toBe(200);
    AuthSession.parse(r1.body);
    expect(r1.body.tokens.refreshToken).not.toBe(tokens.refreshToken);

    // replaying the old refresh token must fail (rotation = theft detection)
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(reuse.status).toBe(401);

    // the rotated token keeps working
    const r2 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: r1.body.tokens.refreshToken });
    expect(r2.status).toBe(200);

    // logout revokes everything outstanding
    const logout = await request(app).post('/api/v1/auth/logout').set(bearer(r2.body.tokens));
    expect(logout.status).toBe(200);
    const afterLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: r2.body.tokens.refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('rejects garbage refresh tokens', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(40) });
    expect(res.status).toBe(401);
  });
});

describe('role guards (run before handlers, even on 501 stubs)', () => {
  it('anonymous access to protected routes → 401', async () => {
    const res = await request(app).get('/api/v1/profile');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('unauthorized');

    const logout = await request(app).post('/api/v1/auth/logout');
    expect(logout.status).toBe(401);
  });

  it('invalid bearer token → 401', async () => {
    const res = await request(app).get('/api/v1/profile').set('Authorization', 'Bearer nonsense');
    expect(res.status).toBe(401);
  });

  it('worker cannot reach assessor routes (403, even on a stub)', async () => {
    const { tokens } = await loginWorker(app);
    const res = await request(app).get('/api/v1/assessor/queue').set(bearer(tokens));
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/assessor/);
  });

  it('plain assessor cannot reach authorized_assessor routes (403)', async () => {
    const { tokens } = await loginAssessor(app, 'assessor');
    const res = await request(app)
      .post('/api/v1/assessments/00000000-0000-4000-8000-000000000000/decision')
      .set(bearer(tokens))
      .send({ outcome: 'approved', notes: 'ok' });
    expect(res.status).toBe(403);
  });

  it('assessor passes the guard on assessor routes → explicit 501 stub', async () => {
    const { tokens } = await loginAssessor(app, 'authorized_assessor');
    const res = await request(app).get('/api/v1/assessor/queue').set(bearer(tokens));
    expect(res.status).toBe(501);
    expect(res.body.error).toBe('not_implemented');
  });

  it('assessor cannot use worker profile routes (403)', async () => {
    const { tokens } = await loginAssessor(app);
    const res = await request(app).get('/api/v1/profile').set(bearer(tokens));
    expect(res.status).toBe(403);
  });
});
