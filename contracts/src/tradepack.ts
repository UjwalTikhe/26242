/**
 * Trade Pack schema — one JSON file per trade (config-driven, no code changes
 * to scale to a new trade). Contains QP/NOS knowledge, tools, safety topics,
 * MCQ bank, task blueprints and level thresholds.
 *
 * Sources are mandatory: every pack must cite where its QP/NOS content came
 * from (NCSR/NSQF/SSC/DGT documents) with a confidence marker.
 */
import { z } from 'zod';
import { LocalizedText } from './common.js';
import { MEDIA_TYPES, TASK_TYPES } from './enums.js';

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

export const SourceRef = z.object({
  title: z.string().min(1),
  url: z.url().optional(),
  publisher: z.string().optional(),
  /** 'verified' = read from the actual QP/NOS document, 'estimated' = inferred. */
  confidence: z.enum(['verified', 'estimated']),
  note: z.string().optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/* ------------------------------------------------------------------ */
/* NSQF knowledge                                                      */
/* ------------------------------------------------------------------ */

export const PerformanceCriterion = z.object({
  /** e.g. "ELE-2-PC1" — stable id referenced by tasks, rubric items and flags */
  id: z.string().min(1),
  text: z.string().min(1),
  /** Power isolation, PPE, arc-flash… always human-routed when violated. */
  criticalSafety: z.boolean().default(false),
  /** Keywords used by the deterministic (no-LLM) scoring/retrieval fallback. */
  keywords: z.array(z.string()).default([]),
});
export type PerformanceCriterion = z.infer<typeof PerformanceCriterion>;

export const Nos = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(['core', 'support', 'safety', 'critical']),
  performanceCriteria: z.array(PerformanceCriterion).min(1),
});
export type Nos = z.infer<typeof Nos>;

export const ToolItem = z.object({
  id: z.string().min(1),
  name: LocalizedText,
  aliases: z.array(z.string()).default([]),
});
export type ToolItem = z.infer<typeof ToolItem>;

export const SafetyTopic = z.object({
  id: z.string().min(1),
  text: LocalizedText,
  critical: z.boolean().default(false),
});
export type SafetyTopic = z.infer<typeof SafetyTopic>;

export const McqItem = z.object({
  id: z.string().min(1),
  topic: z.enum(['safety', 'tools', 'theory']),
  prompt: LocalizedText,
  options: z.array(z.object({ id: z.string(), text: LocalizedText })).min(2),
  correctOptionId: z.string(),
  nosRefs: z.array(z.string()).default([]),
  criticalSafety: z.boolean().default(false),
  explanation: LocalizedText.optional(),
});
export type McqItem = z.infer<typeof McqItem>;

/* ------------------------------------------------------------------ */
/* Task blueprints → become concrete tasks in an AssessmentPlan        */
/* ------------------------------------------------------------------ */

export const EvidenceSpec = z.object({
  media: z.array(z.enum(MEDIA_TYPES)).min(1),
  minCount: z.number().int().min(1).default(1),
  maxCount: z.number().int().min(5).max(50).default(5),
  requireGps: z.boolean().default(true),
  /** Vision AI checks a person is visible doing the task (anti-fake). */
  requireWorkerInFrame: z.boolean().default(false),
  narrationRequired: z.boolean().default(false),
  minDurationSec: z.number().int().min(0).optional(),
  maxDurationSec: z.number().int().min(1).optional(),
});
export type EvidenceSpec = z.infer<typeof EvidenceSpec>;

export const ChecklistItem = z.object({
  id: z.string().min(1),
  text: LocalizedText,
  criterionRef: z.string().optional(),
  criticalSafety: z.boolean().default(false),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const TaskBlueprint = z.object({
  id: z.string().min(1),
  type: z.enum(TASK_TYPES),
  title: LocalizedText,
  brief: LocalizedText.optional(),
  /** NOS codes this task assesses (standards-traced rubric). */
  nosRefs: z.array(z.string()).min(1),
  /** Performance-criterion ids (subset of the NOS criteria). */
  criteriaRefs: z.array(z.string()).default([]),
  weight: z.number().min(0).max(100),
  /** Critical-safety tasks can veto the pass regardless of total score. */
  criticalSafety: z.boolean().default(false),
  evidenceSpec: EvidenceSpec.optional(),
  /** checklist source: derive from criteriaRefs, or use explicit checklistItems */
  checklistFrom: z.enum(['criteria', 'custom']).default('criteria'),
  checklistItems: z.array(ChecklistItem).default([]),
  /** Pulls these MCQ ids from the pack's mcqBank. */
  mcqIds: z.array(z.string()).default([]),
  /** tool_identification: how many correct tools to ask for + distractors. */
  toolPickCount: z.number().int().min(1).optional(),
  toolDistractorCount: z.number().int().min(0).default(3),
  generation: z.enum(['static', 'ai']).default('static'),
});
export type TaskBlueprint = z.infer<typeof TaskBlueprint>;

/* ------------------------------------------------------------------ */
/* Thresholds & level bands                                            */
/* ------------------------------------------------------------------ */

export const LevelBand = z.object({
  level: z.number().int().min(1).max(10),
  minScore: z.number().min(0).max(1),
  maxScore: z.number().min(0).max(1),
  label: z.string().optional(),
});
export type LevelBand = z.infer<typeof LevelBand>;

export const Thresholds = z.object({
  /** Overall weighted score needed to pass (e.g. 0.7). */
  overallPass: z.number().min(0).max(1),
  /** Per-task floor (e.g. 0.6) — a task below this is "needs improvement". */
  perTaskPass: z.number().min(0).max(1),
  /** A failed critical-safety task vetoes the pass. */
  criticalMustPass: z.boolean().default(true),
  /** AI item confidence below this → human_required routing. */
  confidenceHumanRoute: z.number().min(0).max(1).default(0.65),
  /** Suggested NSQF level from overall score. */
  levelBands: z.array(LevelBand).min(1),
  /**
   * Borderline band → "certify at level N-1 + bridge training" instead of a
   * flat fail (gap-to-pathway).
   */
  bridgeBand: z.object({ minScore: z.number().min(0).max(1), maxScore: z.number().min(0).max(1) }),
  /** A declaration-vs-performance gap above this raises a consistency flag. */
  consistencyFlagThreshold: z.number().min(0).max(1).default(0.35),
});
export type Thresholds = z.infer<typeof Thresholds>;

export const BridgeTraining = z.object({
  skillArea: z.string(),
  nosRefs: z.array(z.string()).default([]),
  suggestion: LocalizedText,
});
export type BridgeTraining = z.infer<typeof BridgeTraining>;

/* ------------------------------------------------------------------ */
/* Trade Pack (root)                                                   */
/* ------------------------------------------------------------------ */

export const TradePackQpMeta = z.object({
  title: z.string().min(1),
  qpId: z.string().optional(),
  ncoCode: z.string().optional(),
  nsqfLevel: z.number().int().min(1).max(10),
  ssc: z.string().optional(),
  version: z.string().optional(),
  alignedJobRoles: z.array(z.string()).default([]),
});
export type TradePackQpMeta = z.infer<typeof TradePackQpMeta>;

export const TradePack = z.object({
  schemaVersion: z.literal(1),
  /** kebab-case id, also the file name: electrician.json, welder.json */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: LocalizedText,
  aliases: z.array(z.string()).default([]),
  qp: TradePackQpMeta,
  sources: z.array(SourceRef).min(1),
  nos: z.array(Nos).min(1),
  tools: z.array(ToolItem).min(1),
  safetyTopics: z.array(SafetyTopic).default([]),
  mcqBank: z.array(McqItem).default([]),
  taskBlueprints: z.array(TaskBlueprint).min(1),
  thresholds: Thresholds,
  bridgeTraining: z.array(BridgeTraining).default([]),
});
export type TradePack = z.infer<typeof TradePack>;
