/**
 * Handler registry: contract route key → handler.
 * Unimplemented routes get explicit 501 stubs (warned at boot) — never
 * silently missing, and auth guards still apply.
 */
import { routes } from '@sih/contracts';
import { assessmentHandlers } from './assessments.js';
import { authHandlers } from './auth.js';
import { profileHandlers } from './profile.js';
import { tradeHandlers } from './trades.js';
import { notImplemented, type HandlerMap } from './types.js';

export const handlers: HandlerMap = {
  ...assessmentHandlers,
  ...authHandlers,
  ...profileHandlers,
  ...tradeHandlers,
};

export const stubRoutes: string[] = [];
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  if (!handlers[key]) {
    handlers[key] = notImplemented;
    stubRoutes.push(key);
  }
}
