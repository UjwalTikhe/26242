/**
 * Report, certificate, audit-trail, and public-verification handlers.
 * Decision handlers live in review.ts; these are the read/stream side.
 */
import type { z } from 'zod';
import type { PageQuery } from '@sih/contracts';
import { getCertificateDoc, verifyCertificate } from '../../services/certificate.service.js';
import { listAudit } from '../../services/audit.service.js';
import { renderCertificatePdf } from '../../services/pdf.service.js';
import { getReportFor } from '../../services/report.service.js';
import { Report } from '../../models/report.models.js';
import { userOr401, type HandlerCtx, type HandlerMap } from './types.js';

const idOf = (ctx: HandlerCtx): string => String(ctx.params.id);

export const reportHandlers: HandlerMap = {
  'get /api/v1/assessments/:id/report': async (ctx) => {
    const auth = userOr401(ctx);
    return { status: 200, data: await getReportFor(idOf(ctx), auth) };
  },

  'get /api/v1/assessments/:id/audit': async (ctx) => {
    userOr401(ctx); // assessor-scoped route; guard already enforced the role
    const query = ctx.query as z.infer<typeof PageQuery>;
    return { status: 200, data: await listAudit(idOf(ctx), query) };
  },

  'get /api/v1/certificates/:id/pdf': async (ctx) => {
    const auth = userOr401(ctx);
    const cert = await getCertificateDoc(idOf(ctx), auth);
    const report = await Report.findById(cert.reportId).lean();
    const pdf = await renderCertificatePdf(cert, report);
    ctx.res.setHeader('Content-Type', 'application/pdf');
    ctx.res.setHeader('Content-Disposition', `inline; filename="${cert.certificateNo}.pdf"`);
    ctx.res.setHeader('Content-Length', String(pdf.length));
    ctx.res.end(pdf);
    return undefined; // handler wrote the response itself
  },

  'get /api/v1/verify/:certificateNo': async (ctx) => {
    const { certificateNo } = ctx.params as { certificateNo: string };
    return { status: 200, data: await verifyCertificate(certificateNo) };
  },
};
