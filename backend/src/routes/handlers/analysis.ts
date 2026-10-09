/**
 * Analysis + submit handlers. Validation lives in the contract layer; this
 * layer only wires auth and service calls.
 */
import { getAnalysisFor, getAnalysisStatus } from '../../services/analysis.service.js';
import { submitAssessment } from '../../services/submission.service.js';
import { userOr401, type HandlerMap } from './types.js';

export const analysisHandlers: HandlerMap = {
  'post /api/v1/assessments/:id/submit': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await submitAssessment(String(ctx.params.id), auth) };
  },

  'get /api/v1/assessments/:id/analysis': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await getAnalysisFor(String(ctx.params.id), auth) };
  },

  'get /api/v1/assessments/:id/analysis/status': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await getAnalysisStatus(String(ctx.params.id), auth) };
  },
};
