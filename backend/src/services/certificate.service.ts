/**
 * Certificate issuance + public verification.
 *
 * Issued once per assessment when an authorized assessor APPROVES. The
 * certificate embeds a certificateNo and a verify URL; `verifyCertificate`
 * powers the unauthenticated public check.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { VerifyRes } from '@sih/contracts';
import type { Certificate as CertificateType } from '@sih/contracts';
import { env } from '../config/env.js';
import { notFound } from '../errors.js';
import type { AuthUser } from '../auth/jwt.js';
import { User } from '../models/auth.models.js';
import { Assessment } from '../models/assessment.models.js';
import { WorkerProfile } from '../models/profile.models.js';
import { Certificate, Report, type CertificateDoc } from '../models/report.models.js';
import { Decision } from '../models/review.models.js';
import { toApi } from '../utils/toApi.js';
import { recordAudit } from './audit.service.js';
import { recordChange } from './changelog.service.js';

const base = () => env.PUBLIC_BASE_URL.replace(/\/+$/, '');

function makeCertificateNo(): string {
  const year = new Date().getUTCFullYear();
  const rand = randomBytes(4).toString('hex').toUpperCase();
  return `${env.CERTIFICATE_PREFIX}-${year}-${rand}`;
}

export interface Actor {
  id: string;
  role: string;
}

export async function issueCertificateFor(assessmentId: string, actor?: Actor): Promise<CertificateType> {
  const existing = await Certificate.findOne({ assessmentId }).lean();
  if (existing) return toApi(existing);

  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) throw notFound('Assessment not found');

  const report = await Report.findOne({ assessmentId }).sort({ round: -1 }).lean();
  if (!report) throw notFound('Cannot issue a certificate without a competency report');

  const [profile, user] = await Promise.all([
    WorkerProfile.findOne({ userId: assessment.workerId }).lean(),
    User.findById(assessment.workerId).lean(),
  ]);
  const holderName = profile?.fullName || user?.displayName || 'SIH Candidate';

  const certificateNo = makeCertificateNo();
  const now = new Date();
  const doc = await Certificate.create({
    _id: randomUUID(),
    certificateNo,
    assessmentId,
    reportId: report._id,
    workerId: assessment.workerId,
    holderName,
    tradePackId: report.tradePackId,
    qpTitle: report.qpTitle,
    nsqfLevel: report.suggestedNsqfLevel,
    overallScore: report.overallScore,
    verifyUrl: `${base()}/verify/${certificateNo}`,
    issuedAt: now,
    revoked: false,
  });

  await recordChange({
    entity: 'certificate',
    id: doc._id,
    ownerId: assessment.workerId,
    updatedAt: now,
    data: toApi(doc.toObject()),
  });
  await recordAudit({
    scope: assessmentId,
    entityType: 'certificate',
    entityId: doc._id,
    action: 'issued',
    actorId: actor?.id,
    actorRole: actor?.role,
    data: { certificateNo, nsqfLevel: doc.nsqfLevel, overallScore: doc.overallScore },
  });

  return toApi(doc.toObject());
}

/** Load a certificate the caller may view (worker: own only) for PDF rendering. */
export async function getCertificateDoc(idOrNo: string, user: AuthUser): Promise<CertificateDoc> {
  const doc = await Certificate.findOne({
    $or: [{ _id: idOrNo }, { certificateNo: idOrNo }],
  }).lean();
  if (!doc) throw notFound('Certificate not found');
  if (user.role === 'worker' && doc.workerId !== user.id) throw notFound('Certificate not found');
  return doc;
}

export async function verifyCertificate(certificateNo: string): Promise<z.infer<typeof VerifyRes>> {
  const cert = await Certificate.findOne({ certificateNo }).lean();
  if (!cert) return { valid: false, reason: 'not_found' };
  if (cert.revoked) return { valid: false, reason: 'revoked', certificate: toApi(cert) };

  const [assessment, decision] = await Promise.all([
    Assessment.findById(cert.assessmentId).lean(),
    Decision.findOne({ assessmentId: cert.assessmentId }).lean(),
  ]);

  return {
    valid: true,
    certificate: toApi(cert),
    holder: { name: cert.holderName, trade: cert.qpTitle, nsqfLevel: cert.nsqfLevel },
    assessment: assessment
      ? {
          overallScore: cert.overallScore,
          decidedAt: (decision?.issuedAt ?? cert.issuedAt).toISOString(),
          status: assessment.status,
        }
      : undefined,
  };
}
