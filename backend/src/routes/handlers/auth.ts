/**
 * Auth + health handlers.
 */
import type { z } from 'zod';
import type {
  AssessorLoginReq,
  AssessorRegisterReq,
  HealthRes,
  RefreshReq,
  RequestOtpReq,
  VerifyOtpReq,
} from '@sih/contracts';
import { DateTime } from '@sih/contracts';
import { env } from '../../config/env.js';
import { mongoUp } from '../../db/mongo.js';
import * as authService from '../../services/auth.service.js';
import { getProfileByUser } from '../../services/profile.service.js';
import { User } from '../../models/auth.models.js';
import { toApi } from '../../utils/toApi.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

const startedAt = Date.now();

export const authHandlers: HandlerMap = {
  'get /health': () => {
    const mongo = mongoUp();
    const data: z.infer<typeof HealthRes> = {
      status: mongo ? 'ok' : 'degraded',
      service: 'sih26242-rpl-api',
      version: `v1/${env.NODE_ENV}`,
      time: DateTime.parse(new Date().toISOString()),
      checks: {
        mongo: { status: mongo ? 'up' : 'down' },
        runtime: { status: 'up', detail: `node ${process.version}` },
        uptime: { status: 'up', detail: `${Math.round((Date.now() - startedAt) / 1000)}s` },
      },
    };
    return { status: 200, data };
  },

  'post /api/v1/auth/otp/request': async ({ body }) => {
    const input = body as z.infer<typeof RequestOtpReq>;
    const result = await authService.requestOtp(input);
    return { status: 200, data: { sent: true as const, ...result } };
  },

  'post /api/v1/auth/otp/verify': async ({ body }) => {
    const input = body as z.infer<typeof VerifyOtpReq>;
    const session = await authService.verifyOtp(input);
    return { status: 200, data: session };
  },

  'post /api/v1/auth/assessor/register': async ({ body }) => {
    const input = body as z.infer<typeof AssessorRegisterReq>;
    const session = await authService.assessorRegister(input);
    return { status: 200, data: session };
  },

  'post /api/v1/auth/assessor/login': async ({ body }) => {
    const input = body as z.infer<typeof AssessorLoginReq>;
    const session = await authService.assessorLogin(input);
    return { status: 200, data: session };
  },

  'post /api/v1/auth/refresh': async ({ body }) => {
    const input = body as z.infer<typeof RefreshReq>;
    const session = await authService.refreshSession(input.refreshToken);
    return { status: 200, data: session };
  },

  'post /api/v1/auth/logout': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    await authService.logoutUser(auth.id);
    return { status: 200, data: { ok: true as const } };
  },

  'get /api/v1/auth/me': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const doc = await User.findById(auth.id).lean();
    if (!doc) return { status: 401, data: { error: 'unauthorized', message: 'User no longer exists' } };
    const profile = auth.role === 'worker' ? await getProfileByUser(auth.id).catch(() => undefined) : undefined;
    return { status: 200, data: toApi({ user: doc, profile }) };
  },
};
