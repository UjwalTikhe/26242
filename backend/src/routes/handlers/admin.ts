/**
 * Admin-side read handlers (fairness analytics). The route guard has already
 * enforced the assessor role.
 */
import { computeFairness } from '../../services/fairness.service.js';
import { userOr401, type HandlerMap } from './types.js';

export const adminHandlers: HandlerMap = {
  'get /api/v1/admin/fairness': async (ctx) => {
    userOr401(ctx);
    return { status: 200, data: await computeFairness() };
  },
};
