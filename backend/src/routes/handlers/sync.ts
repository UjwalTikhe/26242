/**
 * Sync handlers: push (idempotent op replay) and pull (cursor change feed).
 * All semantics live in sync.service — this layer only casts contract-parsed
 * input and picks status codes.
 */
import type { z } from 'zod';
import type { SyncPullQuery, SyncPushReq } from '@sih/contracts';
import { pullChanges, pushOps } from '../../services/sync.service.js';
import { userOr401, type HandlerMap } from './types.js';

export const syncHandlers: HandlerMap = {
  'post /api/v1/sync/push': async (ctx) => {
    const auth = userOr401(ctx);
    const body = ctx.body as z.infer<typeof SyncPushReq>;
    return { status: 200, data: await pushOps(auth, body) };
  },

  'get /api/v1/sync/pull': async (ctx) => {
    const auth = userOr401(ctx);
    const query = ctx.query as z.infer<typeof SyncPullQuery>;
    return { status: 200, data: await pullChanges(auth, query) };
  },
};
