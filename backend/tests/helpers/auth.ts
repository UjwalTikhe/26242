/**
 * Auth helpers for tests: real login flows through the HTTP API
 * (mock OTP provider returns the code in the response).
 */
import type { Express } from 'express';
import request from 'supertest';
import { AuthSession } from '@sih/contracts';

let seq = 0;

/** Unique phone per call — the OTP service has a 30s per-phone cooldown. */
export function nextPhone(): string {
  seq += 1;
  return `+91900000${String(1000 + seq)}`;
}

export function nextEmail(): string {
  seq += 1;
  return `worker${seq}@sih.test`;
}

export interface Session {
  tokens: { accessToken: string; refreshToken: string; expiresInSec: number };
  user: { id: string; role: string };
}

export async function loginWorker(
  app: Express,
  opts: { displayName?: string; language?: string } = {},
): Promise<Session & { phone: string }> {
  const phone = nextPhone();

  const otpReq = await request(app).post('/api/v1/auth/otp/request').send({ phone });
  if (otpReq.status !== 200) {
    throw new Error(`otp request failed: ${otpReq.status} ${JSON.stringify(otpReq.body)}`);
  }

  const res = await request(app).post('/api/v1/auth/otp/verify').send({
    phone,
    code: otpReq.body.debugCode,
    deviceId: 'test-device',
    displayName: opts.displayName ?? 'Test Worker',
    language: opts.language,
  });
  if (res.status !== 200) {
    throw new Error(`otp verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  AuthSession.parse(res.body); // contract conformance on every login
  return { phone, user: res.body.user, tokens: res.body.tokens };
}

export async function loginAssessor(
  app: Express,
  role: 'assessor' | 'authorized_assessor' = 'assessor',
): Promise<Session & { email: string }> {
  const email = nextEmail();
  const res = await request(app).post('/api/v1/auth/assessor/register').send({
    email,
    password: 'Password123',
    displayName: 'Test Assessor',
    role,
  });
  if (res.status !== 200) {
    throw new Error(`assessor register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  AuthSession.parse(res.body);
  return { email, user: res.body.user, tokens: res.body.tokens };
}

export const bearer = (tokens: Session['tokens']): Record<string, string> => ({
  Authorization: `Bearer ${tokens.accessToken}`,
});
