/**
 * Assessment flow handlers: create/list/get, declaration, NSQF mapping,
 * plan generation, answers (LWW), start. (submit + AI analysis live in
 * analysis.ts; review/report are later phases — still 501 stubs.)
 */
import type { z } from 'zod';
import type {
  CreateAssessmentReq,
  GeneratePlanReq,
  ListQuery,
  MapReq,
  SubmitAnswersReq,
  SubmitDeclarationReq,
} from '@sih/contracts';
import * as answersService from '../../services/answers.service.js';
import * as assessmentService from '../../services/assessment.service.js';
import * as declarationService from '../../services/declaration.service.js';
import * as mappingService from '../../services/mapping.service.js';
import * as planService from '../../services/plan.service.js';
import { transitionAssessment } from '../../services/assessment.service.js';
import { toApi } from '../../utils/toApi.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

const idOf = (ctx: HandlerCtx): string => String(ctx.params.id);

export const assessmentHandlers: HandlerMap = {
  'post /api/v1/assessments': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof CreateAssessmentReq>;
    const { assessment } = await assessmentService.createAssessment(auth.id, input);
    return { status: 201, data: assessment };
  },

  'get /api/v1/assessments': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const query = ctx.query as z.infer<typeof ListQuery>;
    return { status: 200, data: await assessmentService.listAssessments(auth, query) };
  },

  'get /api/v1/assessments/:id': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await assessmentService.getAssessmentForUser(idOf(ctx), auth) };
  },

  /* --------------------------- declaration ------------------------ */

  'post /api/v1/assessments/:id/declaration': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof SubmitDeclarationReq>;
    const { declaration } = await declarationService.submitDeclaration(idOf(ctx), auth, input);
    return { status: 201, data: declaration };
  },

  'get /api/v1/assessments/:id/declaration': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await declarationService.getDeclarationFor(idOf(ctx), auth) };
  },

  /* ----------------------------- mapping -------------------------- */

  'post /api/v1/assessments/:id/map': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = (ctx.body ?? {}) as z.infer<typeof MapReq>;
    const { match } = await mappingService.mapAssessment(idOf(ctx), auth, input);
    return { status: 200, data: match };
  },

  'get /api/v1/assessments/:id/mapping': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await mappingService.getMappingFor(idOf(ctx), auth) };
  },

  /* ------------------------------- plan --------------------------- */

  'post /api/v1/assessments/:id/plan': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = (ctx.body ?? {}) as z.infer<typeof GeneratePlanReq>;
    const { plan } = await planService.generatePlan(idOf(ctx), auth, input);
    return { status: 201, data: plan };
  },

  'get /api/v1/assessments/:id/plan': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const { plan } = await planService.getPlanFor(idOf(ctx), auth);
    return { status: 200, data: plan };
  },

  /* ------------------------------- answers ------------------------ */

  'post /api/v1/assessments/:id/answers': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof SubmitAnswersReq>;
    const { response, assessment } = await answersService.saveTaskResponse(auth, idOf(ctx), input);
    return { status: 200, data: { response, assessment } };
  },

  'get /api/v1/assessments/:id/answers': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await answersService.listTaskResponses(idOf(ctx), auth) };
  },

  /* ------------------------------ start --------------------------- */

  'post /api/v1/assessments/:id/start': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    // ownership + visibility check first (404 hides existence)
    await assessmentService.getAssessmentFor(idOf(ctx), auth);
    const doc = await transitionAssessment(idOf(ctx), 'IN_PROGRESS', { by: auth.id });
    return { status: 200, data: toApi(doc.toObject()) };
  },
};
