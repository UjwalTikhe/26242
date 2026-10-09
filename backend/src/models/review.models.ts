/**
 * Assessor review + final decision collections.
 *
 * - AssessorReview: one completed review per (assessment, round). Immutable
 *   after write (except the round-1 → round-2 reassessment path creates a new
 *   record). `startedAt` comes from the review claim moment.
 * - Decision: exactly one final decision per assessment (terminal outcome).
 */
import { Schema, model } from 'mongoose';
import { DECISION_OUTCOMES, REVIEW_ITEM_STATUSES, REVIEW_OUTCOMES } from '@sih/contracts';

/* ------------------------------------------------------------------ */
/* Assessor review                                                     */
/* ------------------------------------------------------------------ */

export interface ReviewItemDoc {
  taskId: string;
  aiScore: number | null;
  finalScore: number;
  status: (typeof REVIEW_ITEM_STATUSES)[number];
  comment?: string;
}

export interface AssessorReviewDoc {
  _id: string;
  assessmentId: string;
  round: number;
  assessorId: string;
  items: ReviewItemDoc[];
  overallComment?: string;
  outcome: (typeof REVIEW_OUTCOMES)[number];
  reassessmentTasks: Array<{ taskId: string; reason: string }>;
  startedAt: Date;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reviewItemSchema = new Schema<ReviewItemDoc>(
  {
    taskId: { type: String, required: true },
    aiScore: { type: Number, default: null },
    finalScore: { type: Number, required: true, min: 0, max: 1 },
    status: { type: String, enum: REVIEW_ITEM_STATUSES, required: true },
    comment: { type: String },
  },
  { _id: false },
);

const assessorReviewSchema = new Schema<AssessorReviewDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true },
    round: { type: Number, required: true, default: 1, min: 1 },
    assessorId: { type: String, required: true },
    items: { type: [reviewItemSchema], default: [] },
    overallComment: { type: String },
    outcome: { type: String, enum: REVIEW_OUTCOMES, required: true },
    reassessmentTasks: {
      type: [{ _id: false, taskId: String, reason: String }],
      default: [],
    },
    startedAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false, minimize: false },
);
assessorReviewSchema.index({ assessmentId: 1, round: 1 }, { unique: true });

export const AssessorReview = model<AssessorReviewDoc>('AssessorReview', assessorReviewSchema);

/* ------------------------------------------------------------------ */
/* Final decision                                                      */
/* ------------------------------------------------------------------ */

export interface DecisionDoc {
  _id: string;
  assessmentId: string;
  outcome: (typeof DECISION_OUTCOMES)[number];
  authorizedAssessorId: string;
  comments?: string;
  certificateId?: string;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const decisionSchema = new Schema<DecisionDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true, unique: true },
    outcome: { type: String, enum: DECISION_OUTCOMES, required: true },
    authorizedAssessorId: { type: String, required: true },
    comments: { type: String },
    certificateId: { type: String },
    issuedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const Decision = model<DecisionDoc>('Decision', decisionSchema);
