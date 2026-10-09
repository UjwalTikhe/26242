/**
 * Assessor review + decision handlers. Contract/Zod does the validation; this
 * layer only casts parsed input, calls the service, and picks status codes.
 */
import type { z } from 'zod';
import type { DecisionReq, ListQuery, ReviewSubmitReq } from '@sih/contracts';
import {
  assessorQueue,
  claimReview,
  getDecisionFor,
  getReviewFor,
  submitDecision,
  submitReview,
} from '../../services/review.service.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

const idOf = (ctx: HandlerCtx): string => String(ctx.params.id);

export const reviewHandlers: HandlerMap = {
  /* ------------------------------ review -------------------------- */

  'post /api/v1/assessments/:id/review/claim': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await claimReview(idOf(ctx), auth) };
  },

  'post /api/v1/assessments/:id/review': async (ctx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof ReviewSubmitReq>;
    return { status: 200, data: await submitReview(idOf(ctx), auth, input) };
  },

  'get /api/v1/assessments/:id/review': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await getReviewFor(idOf(ctx), auth) };
  },

  'get /api/v1/assessor/queue': async (ctx) => {
    const auth = userOr401(ctx);
    const query = ctx.query as z.infer<typeof ListQuery>;
    return { status: 200, data: await assessorQueue(auth, query) };
  },

  /* ----------------------------- decision ------------------------- */

  'post /api/v1/assessments/:id/decision': async (ctx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof DecisionReq>;
    return { status: 200, data: await submitDecision(idOf(ctx), auth, input) };
  },

  'get /api/v1/assessments/:id/decision': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await getDecisionFor(idOf(ctx), auth) };
  },
};
