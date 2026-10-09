/**
 * Competency report + issued certificate collections.
 *
 * - Report: one generated report per (assessment, round); the numbers come from
 *   scoring.service (review-over-AI precedence) and the pack's bridge training.
 * - Certificate: issued only on an APPROVED decision; exactly one per
 *   assessment, with a human-facing certificateNo used by the public verify URL.
 */
import { Schema, model } from 'mongoose';
import { REPORT_RECOMMENDATIONS } from '@sih/contracts';

/* ------------------------------------------------------------------ */
/* Competency report                                                   */
/* ------------------------------------------------------------------ */

export interface ReportDoc {
  _id: string;
  assessmentId: string;
  workerId: string;
  round: number;
  tradePackId: string;
  qpTitle: string;
  overallScore: number;
  skillsPassed: unknown[];
  skillsNeedingImprovement: unknown[];
  currentNsqfLevel: number;
  suggestedNsqfLevel: number;
  recommendation: (typeof REPORT_RECOMMENDATIONS)[number];
  consistencyScore: number;
  assessorOverrides: number;
  criticalSafetyPassed: boolean;
  bridgeTraining: unknown[];
  summary?: unknown;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<ReportDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true },
    workerId: { type: String, required: true },
    round: { type: Number, required: true, default: 1, min: 1 },
    tradePackId: { type: String, required: true },
    qpTitle: { type: String, required: true },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    skillsPassed: { type: [Schema.Types.Mixed], default: [] },
    skillsNeedingImprovement: { type: [Schema.Types.Mixed], default: [] },
    currentNsqfLevel: { type: Number, required: true },
    suggestedNsqfLevel: { type: Number, required: true },
    recommendation: { type: String, enum: REPORT_RECOMMENDATIONS, required: true },
    consistencyScore: { type: Number, required: true, min: 0, max: 1 },
    assessorOverrides: { type: Number, default: 0, min: 0 },
    criticalSafetyPassed: { type: Boolean, required: true },
    bridgeTraining: { type: [Schema.Types.Mixed], default: [] },
    summary: { type: Schema.Types.Mixed },
    generatedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false, minimize: false },
);
reportSchema.index({ assessmentId: 1, round: 1 }, { unique: true });

export const Report = model<ReportDoc>('Report', reportSchema);

/* ------------------------------------------------------------------ */
/* Certificate                                                         */
/* ------------------------------------------------------------------ */

export interface CertificateDoc {
  _id: string;
  certificateNo: string;
  assessmentId: string;
  reportId: string;
  workerId: string;
  holderName: string;
  tradePackId: string;
  qpTitle: string;
  nsqfLevel: number;
  overallScore: number;
  verifyUrl: string;
  issuedAt: Date;
  revoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const certificateSchema = new Schema<CertificateDoc>(
  {
    _id: { type: String, required: true },
    certificateNo: { type: String, required: true, unique: true },
    assessmentId: { type: String, required: true, unique: true },
    reportId: { type: String, required: true },
    workerId: { type: String, required: true },
    holderName: { type: String, required: true },
    tradePackId: { type: String, required: true },
    qpTitle: { type: String, required: true },
    nsqfLevel: { type: Number, required: true },
    overallScore: { type: Number, required: true, min: 0, max: 100 },
    verifyUrl: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

export const Certificate = model<CertificateDoc>('Certificate', certificateSchema);
