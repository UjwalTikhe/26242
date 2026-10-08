/**
 * Worker profile handlers (last-write-wins + version conflict semantics).
 */
import type { z } from 'zod';
import type { UpdateProfileReq } from '@sih/contracts';
import * as profileService from '../../services/profile.service.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

export const profileHandlers: HandlerMap = {
  'get /api/v1/profile': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const profile = await profileService.getProfileByUser(auth.id);
    return { status: 200, data: profile };
  },

  'patch /api/v1/profile': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof UpdateProfileReq>;
    const result = await profileService.updateProfile(auth.id, input);
    if (!result.ok) {
      return {
        status: 409,
        data: { error: 'version_conflict', server: result.server, message: result.message },
      };
    }
    return { status: 200, data: result.profile };
  },
};
