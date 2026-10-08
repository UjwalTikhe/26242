/**
 * Handler registry: contract route key → handler.
 * Unimplemented routes get explicit 501 stubs (warned at boot) — never
 * silently missing, and auth guards still apply.
 */
import { routes } from '@sih/contracts';
import { authHandlers } from './auth.js';
import { profileHandlers } from './profile.js';
import { notImplemented, type HandlerMap } from './types.js';

export const handlers: HandlerMap = {
  ...authHandlers,
  ...profileHandlers,
};

export const stubRoutes: string[] = [];
for (const route of routes) {
  const key = `${route.method} ${route.path}`;
  if (!handlers[key]) {
    handlers[key] = notImplemented;
    stubRoutes.push(key);
  }
}
