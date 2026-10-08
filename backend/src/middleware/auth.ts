/**
 * Auth middleware for the contract-driven router.
 * Guards run BEFORE handlers, so role checks work even on stub routes.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { RouteAuth } from '@sih/contracts';
import { AppError, forbidden, unauthorized } from '../errors.js';
import { verifyAccess, type AuthUser } from '../auth/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function extractUser(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return verifyAccess(header.slice(7));
}

function roleAllows(auth: RouteAuth, role: string): boolean {
  switch (auth) {
    case 'public':
      return true;
    case 'any':
      return true;
    case 'worker':
      return role === 'worker';
    case 'assessor':
      return role === 'assessor' || role === 'authorized_assessor' || role === 'admin';
    case 'authorized_assessor':
      return role === 'authorized_assessor' || role === 'admin';
    default:
      return false;
  }
}

export function authGuard(auth: RouteAuth): RequestHandler {
  if (auth === 'public') return (_req, _res, next) => next();
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = extractUser(req);
    if (!user) return next(unauthorized('Missing or invalid access token'));
    if (!roleAllows(auth, user.role)) return next(forbidden(`Requires role: ${auth}`));
    req.user = user;
    next();
  };
}

/** Throw-if-not-asserted helper for services. */
export function requireUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, 'unauthorized', 'Authentication required');
  return req.user;
}
