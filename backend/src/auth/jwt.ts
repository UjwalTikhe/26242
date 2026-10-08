/**
 * JWT sign/verify. Access tokens are short-lived; refresh tokens carry a
 * jti that maps to a server-side RefreshToken record (revocable + rotating).
 */
import jwt from 'jsonwebtoken';
import { type Role } from '@sih/contracts';
import { env } from '../config/env.js';

export interface AuthUser {
  id: string;
  role: Role;
}

interface AccessPayload extends jwt.JwtPayload {
  sub: string;
  role: Role;
  t: 'access';
}

export function signAccess(user: AuthUser): { token: string; expiresInSec: number } {
  const expiresInSec = env.ACCESS_TOKEN_TTL_MIN * 60;
  const token = jwt.sign({ sub: user.id, role: user.role, t: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: expiresInSec,
  });
  return { token, expiresInSec };
}

export function verifyAccess(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.t !== 'access' || !payload.sub || !payload.role) return null;
    return { id: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function signRefresh(user: AuthUser, jti: string): { token: string; expiresInSec: number } {
  const expiresInSec = env.REFRESH_TOKEN_TTL_DAYS * 24 * 3600;
  const token = jwt.sign({ sub: user.id, role: user.role, t: 'refresh', jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresInSec,
  });
  return { token, expiresInSec };
}

export function verifyRefresh(token: string): { user: AuthUser; jti: string } | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as jwt.JwtPayload & {
      t?: string;
      jti?: string;
    };
    if (payload.t !== 'refresh' || !payload.sub || !payload.role || !payload.jti) return null;
    return { user: { id: payload.sub, role: payload.role as Role }, jti: payload.jti };
  } catch {
    return null;
  }
}
