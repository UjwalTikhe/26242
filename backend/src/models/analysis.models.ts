/**
 * AI analysis collections.
 *
 * - AIAnalysis  — one immutable-per-round analysis result (contract AIAnalysis).
 *   Reassessment bumps the round, so unique key is (assessmentId, round).
 * - AnalysisJob — tiny mutable job-status record the client polls via
 *   GET /analysis/status (queued → running → done | error).
 */
import { Schema, model } from 'mongoose';
import { AI_MODES } from '@sih/contracts';

export interface AIAnalysisDoc {
  _id: string;
  assessmentId: string;
  round: number;
  mode: (typeof AI_MODES)[number];
  provider?: string;
  models: { llm?: string; vision?: string; asr?: string };
  items: unknown[];
  keyframes: unknown[];
  narration: unknown[];
  safetySummary: { criticalFlags: number; issues: number };
  pendingHumanTasks: string[];
  pipelineVersion: string;
  computedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const aiAnalysisSchema = new Schema<AIAnalysisDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true },
    round: { type: Number, required: true, default: 1, min: 1 },
    mode: { type: String, enum: AI_MODES, required: true },
    provider: { type: String },
    models: { type: Schema.Types.Mixed, default: () => ({}) },
    items: { type: [Schema.Types.Mixed], default: [] },
    keyframes: { type: [Schema.Types.Mixed], default: [] },
    narration: { type: [Schema.Types.Mixed], default: [] },
    safetySummary: { type: Schema.Types.Mixed, required: true },
    pendingHumanTasks: { type: [String], default: [] },
    pipelineVersion: { type: String, required: true },
    computedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false, minimize: false },
);
// one analysis per assessment round
aiAnalysisSchema.index({ assessmentId: 1, round: 1 }, { unique: true });

export const AIAnalysis = model<AIAnalysisDoc>('AIAnalysis', aiAnalysisSchema);

/* ------------------------------------------------------------------ */
/* Job status                                                          */
/* ------------------------------------------------------------------ */

export type AnalysisState = 'queued' | 'running' | 'done' | 'error';

export interface AnalysisJobDoc {
  _id: string;
  assessmentId: string;
  state: AnalysisState;
  driver: 'inline' | 'bullmq';
  queuedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  message?: string;
}

const analysisJobSchema = new Schema<AnalysisJobDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true },
    state: { type: String, enum: ['queued', 'running', 'done', 'error'], required: true },
    driver: { type: String, enum: ['inline', 'bullmq'], default: 'inline' },
    queuedAt: { type: Date, required: true },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    message: { type: String },
  },
  { timestamps: false, versionKey: false },
);
analysisJobSchema.index({ assessmentId: 1 }, { unique: true });

export const AnalysisJob = model<AnalysisJobDoc>('AnalysisJob', analysisJobSchema);
