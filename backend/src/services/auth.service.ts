/**
 * Auth service: phone-OTP worker login, assessor email+password,
 * refresh-token rotation, session lookup.
 */
import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import type {
  AssessorLoginReq,
  AssessorRegisterReq,
  RequestOtpReq,
  VerifyOtpReq,
} from '@sih/contracts';
import { env } from '../config/env.js';
import { AppError, unauthorized } from '../errors.js';
import { logger } from '../logger.js';
import { getOtpProvider } from '../auth/otp/provider.js';
import { signAccess, signRefresh, verifyRefresh } from '../auth/jwt.js';
import { OtpCode, RefreshToken, User, newId, type UserDoc } from '../models/auth.models.js';
import { WorkerProfile } from '../models/profile.models.js';
import { toApi } from '../utils/toApi.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/* rate limiting (in-memory, per phone) */
const lastRequest = new Map<string, number>();
const OTP_RESEND_COOLDOWN_MS = 30_000;
const MAX_ATTEMPTS = 5;

export async function requestOtp(input: z.infer<typeof RequestOtpReq>): Promise<{ expiresInSec: number; debugCode?: string }> {
  const now = Date.now();
  const prev = lastRequest.get(input.phone) ?? 0;
  if (now - prev < OTP_RESEND_COOLDOWN_MS) {
    throw new AppError(429, 'rate_limited', 'Please wait before requesting another OTP');
  }

  const provider = getOtpProvider();
  const code = provider.generateCode();
  await provider.send(input.phone, code);

  await OtpCode.create({
    _id: newId(),
    phone: input.phone,
    codeHash: sha256(code),
    expiresAt: new Date(now + env.OTP_TTL_SEC * 1000),
    attempts: 0,
  });
  lastRequest.set(input.phone, now);

  return {
    expiresInSec: env.OTP_TTL_SEC,
    debugCode: provider.name === 'mock' && env.NODE_ENV !== 'production' ? code : undefined,
  };
}

export async function verifyOtp(input: z.infer<typeof VerifyOtpReq>) {
  const record = await OtpCode.findOne({
    phone: input.phone,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!record) throw unauthorized('No active OTP — request a new code');
  if (record.attempts >= MAX_ATTEMPTS) {
    throw unauthorized('Too many attempts — request a new code');
  }

  await OtpCode.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
  if (record.codeHash !== sha256(input.code)) {
    throw unauthorized('Incorrect OTP');
  }
  await OtpCode.updateOne({ _id: record._id }, { $set: { consumedAt: new Date() } });

  // find or create worker user
  let user = await User.findOne({ phone: input.phone }).lean();
  if (user && !user.active) throw unauthorized('Account disabled');
  if (!user) {
    const created = await User.create({
      _id: newId(),
      role: 'worker',
      phone: input.phone,
      displayName: input.displayName,
      language: input.language ?? 'en',
      active: true,
    });
    user = created.toObject();
    await WorkerProfile.create({
      _id: newId(),
      userId: user._id,
      phone: input.phone,
      fullName: input.displayName ?? input.phone,
      language: input.language ?? 'en',
      version: 0,
    });
  }

  return issueSession(user as UserDoc, input.deviceId);
}

/* ------------------------------ assessors ------------------------ */

export async function assessorRegister(input: z.infer<typeof AssessorRegisterReq>) {
  const existing = await User.findOne({ email: input.email.toLowerCase() }).lean();
  if (existing) throw new AppError(409, 'email_taken', 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await User.create({
    _id: newId(),
    role: input.role,
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    active: true,
  });
  return issueSession(user.toObject(), undefined);
}

export async function assessorLogin(input: z.infer<typeof AssessorLoginReq>) {
  const user = await User.findOne({ email: input.email.toLowerCase() })
    .select('+passwordHash')
    .lean();
  if (!user || !user.passwordHash) throw unauthorized('Invalid email or password');
  if (!user.active) throw unauthorized('Account disabled');

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    logger.warn({ email: input.email }, 'failed assessor login');
    throw unauthorized('Invalid email or password');
  }
  return issueSession(user as UserDoc, undefined);
}

/* --------------------------- refresh / logout --------------------- */

export async function refreshSession(refreshToken: string) {
  const parsed = verifyRefresh(refreshToken);
  if (!parsed) throw unauthorized('Invalid refresh token');

  const record = await RefreshToken.findById(parsed.jti).lean();
  if (!record || record.revokedAt) throw unauthorized('Refresh token revoked');

  const user = await User.findById(record.userId).lean();
  if (!user || !user.active) throw unauthorized('Account disabled');

  // rotation: revoke old, issue new
  const jti = newId();
  await RefreshToken.updateOne({ _id: parsed.jti }, { $set: { revokedAt: new Date(), replacedBy: jti } });

  return issueSessionRotated(user as UserDoc, jti);
}

export async function logoutUser(userId: string): Promise<void> {
  await RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/* ------------------------------ helpers -------------------------- */

async function issueSession(user: UserDoc, deviceId?: string) {
  const jti = newId();
  return issueSessionRotated(user, jti, deviceId);
}

async function issueSessionRotated(user: UserDoc, jti: string, deviceId?: string) {
  const authUser = { id: user._id, role: user.role };
  const access = signAccess(authUser);
  const refresh = signRefresh(authUser, jti);

  await RefreshToken.create({
    _id: jti,
    userId: user._id,
    expiresAt: new Date(Date.now() + refresh.expiresInSec * 1000),
    userAgent: deviceId,
  });

  return {
    user: toApi({
      id: user._id,
      role: user.role,
      phone: user.phone,
      email: user.email,
      displayName: user.displayName,
      language: user.language,
      active: user.active,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }),
    tokens: {
      accessToken: access.token,
      refreshToken: refresh.token,
      expiresInSec: access.expiresInSec,
    },
  };
}
