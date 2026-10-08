/**
 * Trade pack endpoints (public): list summaries, fetch full pack.
 */
import { getTradePack, listTradePacks } from '../../services/tradepack.service.js';
import type { HandlerCtx, HandlerMap } from './types.js';

export const tradeHandlers: HandlerMap = {
  'get /api/v1/trades': async () => ({
    status: 200,
    data: { items: await listTradePacks() },
  }),

  'get /api/v1/trades/:id': async (ctx: HandlerCtx) => ({
    status: 200,
    data: await getTradePack(String(ctx.params.id)),
  }),
};
