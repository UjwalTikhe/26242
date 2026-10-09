/**
 * Evidence handlers: JSON registration (201), paginated listing, and the
 * byte stream for review. Bytes always come from storage — this layer never
 * touches hashes or chains (that's evidence.service).
 */
import type { z } from 'zod';
import { PageQuery, RegisterEvidenceReq } from '@sih/contracts';
import { notFound } from '../../errors.js';
import { Evidence } from '../../models/evidence.models.js';
import { getAssessmentFor } from '../../services/assessment.service.js';
import { listEvidence, registerEvidence } from '../../services/evidence.service.js';
import { getStorage } from '../../storage/index.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

const idOf = (ctx: HandlerCtx): string => String(ctx.params.id);

export const evidenceHandlers: HandlerMap = {
  'post /api/v1/assessments/:id/evidence': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const input = ctx.body as z.infer<typeof RegisterEvidenceReq>;
    const { evidence } = await registerEvidence(idOf(ctx), auth, input);
    return { status: 201, data: evidence };
  },

  'get /api/v1/assessments/:id/evidence': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const query = ctx.query as z.infer<typeof PageQuery>;
    return { status: 200, data: await listEvidence(idOf(ctx), auth, query) };
  },

  'get /api/v1/evidence/:id/content': async (ctx: HandlerCtx) => {
    const auth = userOr401(ctx);
    const evidence = await Evidence.findById(idOf(ctx)).lean();
    if (!evidence) throw notFound('Evidence not found');
    // visibility follows the parent assessment (404 hides existence)
    await getAssessmentFor(evidence.assessmentId, auth);

    const storage = getStorage();
    if (!(await storage.exists(evidence.storageKey))) throw notFound('Evidence bytes not found');
    const stream = await storage.getStream(evidence.storageKey);

    const res = ctx.res;
    res.status(200);
    res.setHeader('Content-Type', evidence.mimeType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(evidence.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="evidence-${evidence._id}"`);
    res.setHeader('ETag', `"${evidence.integrity?.serverSha256 ?? ''}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return undefined; // handler wrote the response itself
  },
};
