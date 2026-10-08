/**
 * Assessment domain models (aggregate root + declaration, mapping, plan,
 * task responses). Contract-shaped nested objects (LocalizedText, evidence
 * specs, options, answers, matches) are stored as Mixed: @sih/contracts Zod
 * is the validator at the API boundary; mongoose enforces identity, status
 * enum, and the indexes the queries need.
 */
import { randomUUID } from 'node:crypto';
import { Schema, model, type HydratedDocument } from 'mongoose';
import { ASSESSMENT_STATUSES, LANGUAGES, type AssessmentStatus } from '@sih/contracts';

/* ------------------------------------------------------------------ */
/* Assessment (aggregate root, owns the state machine)                 */
/* ------------------------------------------------------------------ */

export interface StatusEventDoc {
  status: AssessmentStatus;
  at: Date;
  by?: string;
  note?: string;
}

export interface AssessmentDoc {
  _id: string;
  workerId: string;
  status: AssessmentStatus;
  round: number;
  language: (typeof LANGUAGES)[number];
  claimedBy?: string;
  version: number;
  statusHistory: StatusEventDoc[];
  /** Carried from creation into mapping when MapReq sends no hint. */
  tradeHint?: string;
  createdAt: Date;
  updatedAt: Date;
}

const statusEventSchema = new Schema<StatusEventDoc>(
  {
    status: { type: String, enum: ASSESSMENT_STATUSES, required: true },
    at: { type: Date, required: true },
    by: { type: String },
    note: { type: String },
  },
  { _id: false },
);

const assessmentSchema = new Schema<AssessmentDoc>(
  {
    _id: { type: String, required: true },
    workerId: { type: String, required: true },
    status: { type: String, enum: ASSESSMENT_STATUSES, required: true, default: 'DRAFT' },
    round: { type: Number, default: 1, min: 1 },
    language: { type: String, enum: LANGUAGES, default: 'en' },
    claimedBy: { type: String },
    version: { type: Number, default: 0, min: 0 },
    statusHistory: { type: [statusEventSchema], default: [] },
    tradeHint: { type: String },
  },
  { timestamps: true, versionKey: false },
);
assessmentSchema.index({ workerId: 1, updatedAt: -1 });
assessmentSchema.index({ status: 1, updatedAt: -1 });

export const Assessment = model<AssessmentDoc>('Assessment', assessmentSchema);
export type AssessmentDocument = HydratedDocument<AssessmentDoc>;

/* ------------------------------------------------------------------ */
/* Self-declaration                                                     */
/* ------------------------------------------------------------------ */

export interface DeclarationDoc {
  _id: string;
  assessmentId: string;
  workerId: string;
  language: string;
  answers: Record<string, unknown>;
  voiceAnswers: unknown[];
  version: number;
  clientUpdatedAt?: Date;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const declarationSchema = new Schema<DeclarationDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true, unique: true },
    workerId: { type: String, required: true },
    language: { type: String, enum: LANGUAGES, default: 'en' },
    answers: { type: Schema.Types.Mixed, required: true },
    voiceAnswers: { type: [Schema.Types.Mixed], default: [] },
    version: { type: Number, default: 0 },
    clientUpdatedAt: { type: Date },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

export const Declaration = model<DeclarationDoc>('Declaration', declarationSchema);

/* ------------------------------------------------------------------ */
/* QP match (NSQF mapping result, one per assessment)                  */
/* ------------------------------------------------------------------ */

export interface QPMatchDoc {
  _id: string;
  assessmentId: string;
  matches: unknown[];
  mode: 'llm' | 'fallback' | 'mixed';
  provider?: string;
  model?: string;
  createdAt: Date;
  updatedAt: Date;
}

const qpMatchSchema = new Schema<QPMatchDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true, unique: true },
    matches: { type: [Schema.Types.Mixed], required: true },
    mode: { type: String, enum: ['llm', 'fallback', 'mixed'], required: true },
    provider: { type: String },
    model: { type: String },
  },
  { timestamps: true, versionKey: false },
);

export const QPMatch = model<QPMatchDoc>('QPMatch', qpMatchSchema);

/* ------------------------------------------------------------------ */
/* Assessment plan + tasks (one plan per assessment)                   */
/* ------------------------------------------------------------------ */

export interface AssessmentPlanDoc {
  _id: string;
  assessmentId: string;
  tradePackId: string;
  qpTitle: string;
  nsqfLevel: number;
  /** Task subdocs — `correctIds` is the server-only answer key. */
  tasks: unknown[];
  totalWeight: number;
  generatedBy: 'rule' | 'ai';
  createdAt: Date;
  updatedAt: Date;
}

const planSchema = new Schema<AssessmentPlanDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true, unique: true },
    tradePackId: { type: String, required: true },
    qpTitle: { type: String, required: true },
    nsqfLevel: { type: Number, required: true, min: 1, max: 10 },
    tasks: { type: [Schema.Types.Mixed], required: true },
    totalWeight: { type: Number, required: true },
    generatedBy: { type: String, enum: ['rule', 'ai'], default: 'rule' },
  },
  { timestamps: true, versionKey: false },
);

export const AssessmentPlan = model<AssessmentPlanDoc>('AssessmentPlan', planSchema);

/* ------------------------------------------------------------------ */
/* Task response (auto-scored answers, per round)                      */
/* ------------------------------------------------------------------ */

export interface TaskResponseDoc {
  _id: string;
  assessmentId: string;
  taskId: string;
  workerId: string;
  round: number;
  answers: Record<string, unknown>;
  autoScore?: Record<string, unknown>;
  clientUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskResponseSchema = new Schema<TaskResponseDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true },
    taskId: { type: String, required: true },
    workerId: { type: String, required: true },
    round: { type: Number, default: 1, min: 1 },
    answers: { type: Schema.Types.Mixed, required: true },
    autoScore: { type: Schema.Types.Mixed },
    clientUpdatedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);
// one live response per task per round (re-submits update in place, LWW)
taskResponseSchema.index({ assessmentId: 1, taskId: 1, round: 1 }, { unique: true });
taskResponseSchema.index({ assessmentId: 1, updatedAt: -1 });

export const TaskResponse = model<TaskResponseDoc>('TaskResponse', taskResponseSchema);

export const newUuid = () => randomUUID();
