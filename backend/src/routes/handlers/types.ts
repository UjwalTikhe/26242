/**
 * Handler contract: handlers are keyed by `${method} ${path}` exactly as
 * registered in @sih/contracts `routes[]`.
 *
 * Return `{ status, data }` to respond with JSON, or `undefined` if the
 * handler wrote the response itself (streams: PDF, file content).
 */
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/jwt.js';
import { AppError } from '../../errors.js';

export interface HandlerCtx {
  req: Request;
  res: Response;
  params: Record<string, unknown>;
  query: unknown;
  body: unknown;
  user?: AuthUser;
}

export interface HandlerResult {
  status?: number;
  data?: unknown;
}

export type RouteHandler = (ctx: HandlerCtx) => Promise<HandlerResult | undefined> | HandlerResult | undefined;
export type HandlerMap = Record<string, RouteHandler>;

export const notImplemented = (): HandlerResult => ({
  status: 501,
  data: { error: 'not_implemented', message: 'Route exists in contract but has no handler yet' },
});

/** Handler-side auth assertion (guards already ran; this is belt+braces). */
export function userOr401(ctx: HandlerCtx): AuthUser {
  if (!ctx.user) throw new AppError(401, 'unauthorized', 'Authentication required');
  return ctx.user;
}
