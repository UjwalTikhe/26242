/**
 * Shared entity schemas — the ten core entities from the implementation plan
 * plus supporting ones. These appear in responses of both sides of the API.
 */
import { z } from 'zod';
import { DateTime, GeoPoint, Id, Language, LocalizedText, Timestamps, Version } from './common.js';
import {
  AI_MODES,
  ALERT_LEVELS,
  ALERT_TYPES,
  ASSESSMENT_STATUSES,
  DECISION_OUTCOMES,
  DIAGNOSTIC_MODES,
  DIAGNOSTIC_SESSION_STATUSES,
  DEVICE_TYPES,
  EVIDENCE_STATUSES,
  FLAG_KINDS,
  ITEM_ROUTINGS,
  MEDIA_TYPES,
  REPORT_RECOMMENDATIONS,
  REVIEW_ITEM_STATUSES,
  REVIEW_OUTCOMES,
  ROLES,
  SEVERITIES,
  SENSOR_TYPES,
  TASK_TYPES,
} from './enums.js';
import { ChecklistItem, EvidenceSpec } from './tradepack.js';

/* ================================================================== */
/* Auth / user                                                         */
/* ================================================================== */

export const User = z.object({
  id: Id,
  role: z.enum(ROLES),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  language: Language.default('en'),
  active: z.boolean().default(true),
  ...Timestamps.shape,
});
export type User = z.infer<typeof User>;

/* ================================================================== */
/* Worker profile                                                      */
/* ================================================================== */

export const Gender = z.enum(['male', 'female', 'other', 'prefer_not_to_say']);

export const WorkerProfile = z.object({
  id: Id,
  userId: Id,
  phone: z.string().optional(),
  fullName: z.string().min(1),
  gender: Gender.optional(),
  dateOfBirth: z.string().optional(),
  language: Language.default('en'),
  region: z
    .object({
      state: z.string().optional(),
      district: z.string().optional(),
      pin: z.string().optional(),
    })
    .default({}),
  /** Free-form trade names the worker selected/entered. */
  trades: z.array(z.string()).default([]),
  yearsExperience: z.number().min(0).max(60).default(0),
  photoStorageKey: z.string().optional(),
  /** Last-write-wins: bumped by the client on every local edit. */
  version: Version.default(0),
  clientUpdatedAt: DateTime.optional(),
  ...Timestamps.shape,
});
export type WorkerProfile = z.infer<typeof WorkerProfile>;

/* ================================================================== */
/* Self-declaration                                                     */
/* ================================================================== */

export const DeclarationAnswers = z.object({
  yearsExperience: z.number().min(0).max(60),
  /** Type of work done (free labels from a select list + free text) */
  workTypes: z.array(z.string()).default([]),
  toolsUsed: z.array(z.string()).default([]),
  tasksCanPerform: z.array(z.string()).default([]),
  sectors: z.array(z.string()).default([]),
  employmentTypes: z.array(z.string()).default([]),
  notes: z.string().optional(),
});
export type DeclarationAnswers = z.infer<typeof DeclarationAnswers>;

export const VoiceAnswer = z.object({
  questionId: z.string(),
  transcript: z.string(),
  language: Language.optional(),
  evidenceId: Id.optional(),
  /** Worker confirmed the ASR transcript before submitting. */
  confirmed: z.boolean().default(false),
});
export type VoiceAnswer = z.infer<typeof VoiceAnswer>;

export const Declaration = z.object({
  id: Id,
  assessmentId: Id,
  workerId: Id,
  language: Language.default('en'),
  answers: DeclarationAnswers,
  voiceAnswers: z.array(VoiceAnswer).default([]),
  version: Version.default(0),
  clientUpdatedAt: DateTime.optional(),
  submittedAt: DateTime,
  ...Timestamps.shape,
});
export type Declaration = z.infer<typeof Declaration>;

/* ================================================================== */
/* QP match (NSQF mapping)                                             */
/* ================================================================== */

export const QPMatchCandidate = z.object({
  tradePackId: z.string(),
  qpTitle: z.string(),
  jobRole: z.string().optional(),
  nsqfLevel: z.number().int(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  matchedConcepts: z.array(z.string()).default([]),
});
export type QPMatchCandidate = z.infer<typeof QPMatchCandidate>;

export const QPMatch = z.object({
  id: Id,
  assessmentId: Id,
  /** Top-3, sorted by confidence desc. */
  matches: z.array(QPMatchCandidate).min(1).max(3),
  mode: z.enum(['llm', 'fallback', 'mixed']),
  provider: z.string().optional(),
  model: z.string().optional(),
  ...Timestamps.shape,
});
export type QPMatch = z.infer<typeof QPMatch>;

/* ================================================================== */
/* Assessment plan + tasks                                             */
/* ================================================================== */

export const PresentedOption = z.object({
  id: z.string(),
  text: LocalizedText,
});
export type PresentedOption = z.infer<typeof PresentedOption>;

export const Task = z.object({
  id: Id,
  assessmentId: Id,
  planId: Id,
  order: z.number().int().min(0),
  type: z.enum(TASK_TYPES),
  title: LocalizedText,
  brief: LocalizedText.optional(),
  nosRefs: z.array(z.string()).default([]),
  criteriaRefs: z.array(z.string()).default([]),
  weight: z.number().min(0).max(100),
  criticalSafety: z.boolean().default(false),
  evidenceSpec: EvidenceSpec.optional(),
  /** mcq / tool_identification: the presented set (possibly shuffled) */
  presentedOptions: z.array(PresentedOption).default([]),
  /** Server-only answer key — stripped for worker-facing responses. */
  correctIds: z.array(z.string()).default([]),
  checklistItems: z.array(ChecklistItem).default([]),
  ...Timestamps.shape,
});
export type Task = z.infer<typeof Task>;

/** Worker-facing task: no answer key. */
export const PublicTask = Task.omit({ correctIds: true });
export type PublicTask = z.infer<typeof PublicTask>;

export const AssessmentPlan = z.object({
  id: Id,
  assessmentId: Id,
  tradePackId: z.string(),
  qpTitle: z.string(),
  nsqfLevel: z.number().int(),
  tasks: z.array(Task),
  totalWeight: z.number(),
  generatedBy: z.enum(['rule', 'ai']),
  ...Timestamps.shape,
});
export type AssessmentPlan = z.infer<typeof AssessmentPlan>;

/* ================================================================== */
/* Task response (auto-scored answers)                                 */
/* ================================================================== */

export const TaskAnswers = z.object({
  /** mcq / tool_identification selection */
  selectedOptionIds: z.array(z.string()).default([]),
  /** checklist affirmative confirmations */
  checkedItemIds: z.array(z.string()).default([]),
  textAnswer: z.string().optional(),
});
export type TaskAnswers = z.infer<typeof TaskAnswers>;

export const AutoScore = z.object({
  /** 0..1 fraction of obtainable marks */
  score: z.number().min(0).max(1),
  perCriterion: z
    .array(z.object({ criterionRef: z.string(), score: z.number().min(0).max(1) }))
    .default([]),
  gradedAt: DateTime,
});
export type AutoScore = z.infer<typeof AutoScore>;

export const TaskResponse = z.object({
  id: Id,
  assessmentId: Id,
  taskId: Id,
  workerId: Id,
  round: z.number().int().min(1).default(1),
  answers: TaskAnswers,
  /** Deterministic server-side grading (answer key), never AI. */
  autoScore: AutoScore.optional(),
  clientUpdatedAt: DateTime.optional(),
  ...Timestamps.shape,
});
export type TaskResponse = z.infer<typeof TaskResponse>;

/* ================================================================== */
/* Evidence (append-only)                                              */
/* ================================================================== */

export const NarrationTranscript = z.object({
  text: z.string(),
  language: Language.optional(),
  source: z.enum(['asr', 'client']),
  confirmed: z.boolean().default(false),
  provider: z.string().optional(),
});
export type NarrationTranscript = z.infer<typeof NarrationTranscript>;

export const EvidenceIntegrity = z.object({
  /** Server-computed SHA-256 of stored bytes. */
  serverSha256: z.string(),
  /** Hash claimed by the device at capture time (Web Crypto). */
  clientSha256: z.string().optional(),
  hashVerified: z.boolean().default(false),
  /** Hash-chain link over evidence of the same assessment (tamper-evident). */
  chainPrev: z.string().optional(),
  chainHash: z.string().optional(),
});
export type EvidenceIntegrity = z.infer<typeof EvidenceIntegrity>;

export const Evidence = z.object({
  id: Id,
  assessmentId: Id,
  taskId: Id.optional(),
  workerId: Id,
  round: z.number().int().min(1).default(1),
  /** Append-order within (assessment, task, round). */
  seq: z.number().int().min(0).default(0),
  kind: z.enum(MEDIA_TYPES),
  storageKey: z.string(),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().optional(),
  capturedAt: DateTime,
  deviceId: z.string().optional(),
  appVersion: z.string().optional(),
  gps: GeoPoint.optional(),
  language: Language.optional(),
  narration: NarrationTranscript.optional(),
  status: z.enum(EVIDENCE_STATUSES).default('received'),
  integrity: EvidenceIntegrity,
  /**
   * Append-only contract: content fields above are immutable after creation.
   * Only `status` and server-owned AI annotations may change.
   */
  ...Timestamps.shape,
});
export type Evidence = z.infer<typeof Evidence>;

/* ================================================================== */
/* AI analysis                                                         */
/* ================================================================== */

export const AIFlag = z.object({
  kind: z.enum(FLAG_KINDS),
  severity: z.enum(SEVERITIES),
  message: z.string(),
  nosRef: z.string().optional(),
  criterionRef: z.string().optional(),
  /** Position in a video/audio (seconds) — assessor jumps straight there. */
  timestampSec: z.number().min(0).optional(),
  evidenceIds: z.array(Id).default([]),
});
export type AIFlag = z.infer<typeof AIFlag>;

export const AIItemScore = z.object({
  taskId: Id,
  /** Item is tied to specific performance criteria where applicable. */
  criterionRef: z.string().optional(),
  routing: z.enum(ITEM_ROUTINGS),
  criticalSafety: z.boolean().default(false),
  /** 0..1 AI-suggested score; null when routed straight to human. */
  aiScore: z.number().min(0).max(1).nullable(),
  confidence: z.number().min(0).max(1),
  flags: z.array(AIFlag).default([]),
  note: z.string().optional(),
  requiresHuman: z.boolean().default(false),
});
export type AIItemScore = z.infer<typeof AIItemScore>;

export const KeyframeCheck = z.object({
  evidenceId: Id,
  timestampSec: z.number().min(0),
  storageKey: z.string(),
  checks: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])),
  summary: z.string().optional(),
});
export type KeyframeCheck = z.infer<typeof KeyframeCheck>;

export const NarrationAnalysis = z.object({
  evidenceId: Id,
  transcript: z.string(),
  language: Language.optional(),
  flags: z.array(AIFlag).default([]),
  /** Rubric keywords detected in the narration (deterministic fallback). */
  keywordHits: z.array(z.string()).default([]),
});
export type NarrationAnalysis = z.infer<typeof NarrationAnalysis>;

export const AIAnalysis = z.object({
  id: Id,
  assessmentId: Id,
  round: z.number().int().min(1).default(1),
  mode: z.enum(AI_MODES),
  provider: z.string().optional(),
  models: z
    .object({ llm: z.string().optional(), vision: z.string().optional(), asr: z.string().optional() })
    .default({}),
  items: z.array(AIItemScore),
  keyframes: z.array(KeyframeCheck).default([]),
  narration: z.array(NarrationAnalysis).default([]),
  safetySummary: z.object({
    criticalFlags: z.number().int().min(0).default(0),
    issues: z.number().int().min(0).default(0),
  }),
  /** Task ids where the AI explicitly deferred to a human. */
  pendingHumanTasks: z.array(Id).default([]),
  pipelineVersion: z.string(),
  computedAt: DateTime,
  ...Timestamps.shape,
});
export type AIAnalysis = z.infer<typeof AIAnalysis>;

/* ================================================================== */
/* Assessor review                                                     */
/* ================================================================== */

export const ReviewItem = z.object({
  taskId: Id,
  aiScore: z.number().min(0).max(1).nullable(),
  finalScore: z.number().min(0).max(1),
  status: z.enum(REVIEW_ITEM_STATUSES),
  comment: z.string().optional(),
});
export type ReviewItem = z.infer<typeof ReviewItem>;

export const AssessorReview = z.object({
  id: Id,
  assessmentId: Id,
  round: z.number().int().min(1).default(1),
  assessorId: Id,
  items: z.array(ReviewItem),
  overallComment: z.string().optional(),
  outcome: z.enum(REVIEW_OUTCOMES),
  reassessmentTasks: z
    .array(z.object({ taskId: Id, reason: z.string() }))
    .default([]),
  startedAt: DateTime,
  completedAt: DateTime,
  ...Timestamps.shape,
});
export type AssessorReview = z.infer<typeof AssessorReview>;

/* ================================================================== */
/* Competency report                                                   */
/* ================================================================== */

export const SkillResult = z.object({
  nosRef: z.string(),
  title: z.string(),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  criticalSafety: z.boolean().default(false),
});
export type SkillResult = z.infer<typeof SkillResult>;

export const BridgeSuggestion = z.object({
  skillArea: z.string(),
  nosRefs: z.array(z.string()).default([]),
  suggestion: LocalizedText,
});
export type BridgeSuggestion = z.infer<typeof BridgeSuggestion>;

export const CompetencyReport = z.object({
  id: Id,
  assessmentId: Id,
  workerId: Id,
  round: z.number().int().min(1).default(1),
  tradePackId: z.string(),
  qpTitle: z.string(),
  /** 0..100 weighted overall */
  overallScore: z.number().min(0).max(100),
  skillsPassed: z.array(SkillResult),
  skillsNeedingImprovement: z.array(SkillResult),
  currentNsqfLevel: z.number().int(),
  suggestedNsqfLevel: z.number().int(),
  recommendation: z.enum(REPORT_RECOMMENDATIONS),
  consistencyScore: z.number().min(0).max(1),
  assessorOverrides: z.number().int().min(0).default(0),
  criticalSafetyPassed: z.boolean(),
  bridgeTraining: z.array(BridgeSuggestion).default([]),
  summary: LocalizedText.optional(),
  generatedAt: DateTime,
  ...Timestamps.shape,
});
export type CompetencyReport = z.infer<typeof CompetencyReport>;

/* ================================================================== */
/* Decision + certificate                                              */
/* ================================================================== */

export const Decision = z.object({
  id: Id,
  assessmentId: Id,
  outcome: z.enum(DECISION_OUTCOMES),
  authorizedAssessorId: Id,
  comments: z.string().optional(),
  certificateId: Id.optional(),
  issuedAt: DateTime,
  ...Timestamps.shape,
});
export type Decision = z.infer<typeof Decision>;

export const Certificate = z.object({
  id: Id,
  certificateNo: z.string(),
  assessmentId: Id,
  reportId: Id,
  workerId: Id,
  holderName: z.string(),
  tradePackId: z.string(),
  qpTitle: z.string(),
  nsqfLevel: z.number().int(),
  overallScore: z.number().min(0).max(100),
  verifyUrl: z.string(),
  issuedAt: DateTime,
  revoked: z.boolean().default(false),
  ...Timestamps.shape,
});
export type Certificate = z.infer<typeof Certificate>;

/* ================================================================== */
/* Assessment (aggregate root — owns the state machine)                */
/* ================================================================== */

export const StatusEvent = z.object({
  status: z.enum(ASSESSMENT_STATUSES),
  at: DateTime,
  by: Id.optional(),
  note: z.string().optional(),
});
export type StatusEvent = z.infer<typeof StatusEvent>;

export const Assessment = z.object({
  id: Id,
  workerId: Id,
  status: z.enum(ASSESSMENT_STATUSES),
  /** Increments on REASSESS; answers/evidence are tagged with their round. */
  round: z.number().int().min(1).default(1),
  language: Language.default('en'),
  /** Claimed by an assessor when status = UNDER_REVIEW. */
  claimedBy: Id.optional(),
  version: Version.default(0),
  statusHistory: z.array(StatusEvent).default([]),
  ...Timestamps.shape,
});
export type Assessment = z.infer<typeof Assessment>;

/* ================================================================== */
/* Audit log (append-only hash chain)                                  */
/* ================================================================== */

export const AuditLogEntry = z.object({
  seq: z.number().int().min(1),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  actorId: z.string().optional(),
  actorRole: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  prevHash: z.string(),
  payloadHash: z.string(),
  hash: z.string(),
  at: DateTime,
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

/* ================================================================== */
/* Sensor diagnostics                                                  */
/* ================================================================== */

export const Device = z.object({
  id: Id,
  deviceId: z.string(), // Hardware identifier
  serialNumber: z.string().optional(),
  type: z.enum(DEVICE_TYPES),
  name: z.string(),
  /** Supported sensor types */
  sensors: z.array(z.enum(SENSOR_TYPES)),
  /** Trade associations (e.g., plumber, welder, electrician) */
  associatedTrades: z.array(z.string()).default([]),
  /** Current firmware version */
  firmwareVersion: z.string().optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  lastSeenAt: DateTime.optional(),
  isActive: z.boolean().default(true),
  ...Timestamps.shape,
});
export type Device = z.infer<typeof Device>;

export const SensorReading = z.object({
  id: Id,
  deviceId: Id,
  sessionId: Id,
  sensorType: z.enum(SENSOR_TYPES),
  /** Sensor-specific unit (e.g., ppm, °C, dB, mbar) */
  unit: z.string(),
  value: z.number(),
  /** Raw sensor value before calibration */
  rawValue: z.number().optional(),
  /** GPS location of reading */
  location: GeoPoint.optional(),
  /** Accuracy/confidence of reading */
  accuracy: z.number().min(0).max(1).optional(),
  /** Alert level based on safety thresholds */
  alertLevel: z.enum(ALERT_LEVELS).default('safe'),
  /** Calibrated timestamp */
  timestamp: DateTime,
  ...Timestamps.shape,
});
export type SensorReading = z.infer<typeof SensorReading>;

export const SafetyThreshold = z.object({
  id: Id,
  sensorType: z.enum(SENSOR_TYPES),
  tradePackId: z.string().optional(), // Trade-specific threshold
  /** Threshold name/description */
  name: z.string(),
  /** Occupational safety standard reference (e.g., OSHA, BIS) */
  standardRef: z.string().optional(),
  /** Safe upper limit */
  maxSafe: z.number(),
  /** Warning threshold (percentage of max) */
  warningThreshold: z.number().min(0).max(1).default(0.7),
  /** Critical/danger threshold (percentage of max) */
  criticalThreshold: z.number().min(0).max(1).default(0.9),
  /** Unit of measurement */
  unit: z.string(),
  /** Duration-based thresholds (exposure time limits) */
  durationLimitSec: z.number().int().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  ...Timestamps.shape,
});
export type SafetyThreshold = z.infer<typeof SafetyThreshold>;

export const DiagnosticSession = z.object({
  id: Id,
  deviceId: Id,
  workerId: Id,
  assessmentId: Id.optional(), // Optional: linked to assessment
  trainerId: Id.optional(), // Trainer overseeing the session
  mode: z.enum(DIAGNOSTIC_MODES),
  status: z.enum(DIAGNOSTIC_SESSION_STATUSES).default('active'),
  /** Trade being practiced */
  trade: z.string().optional(),
  /** Specific task or scenario */
  scenario: z.string().optional(),
  /** Session start time */
  startedAt: DateTime,
  /** Session end time */
  endedAt: DateTime.optional(),
  /** Number of readings collected */
  readingCount: z.number().int().default(0),
  /** Maximum alert level reached */
  maxAlertLevel: z.enum(ALERT_LEVELS).default('safe'),
  /** Safety violations detected */
  violations: z.array(
    z.object({
      sensorType: z.enum(SENSOR_TYPES),
      value: z.number(),
      threshold: z.number(),
      at: DateTime,
      resolvedAt: DateTime.optional(),
    }),
  ).default([]),
  /** Trainer notes */
  trainerNotes: z.string().optional(),
  /** Session summary for AI/trainer review */
  summary: z.string().optional(),
  ...Timestamps.shape,
});
export type DiagnosticSession = z.infer<typeof DiagnosticSession>;

export const DeviceAlert = z.object({
  id: Id,
  sessionId: Id,
  deviceId: Id,
  sensorType: z.enum(SENSOR_TYPES),
  alertLevel: z.enum(ALERT_LEVELS),
  value: z.number(),
  threshold: z.number(),
  /** Alert types triggered */
  alertTypes: z.array(z.enum(ALERT_TYPES)).default(['visual']),
  /** Whether the alert was acknowledged */
  acknowledged: z.boolean().default(false),
  acknowledgedAt: DateTime.optional(),
  timestamp: DateTime,
  ...Timestamps.shape,
});
export type DeviceAlert = z.infer<typeof DeviceAlert>;

/* ================================================================== */
/* Sync (offline contract)                                             */
/* ================================================================== */

export const SyncRecord = z.object({
  entity: z.string(),
  id: Id,
  version: Version.optional(),
  updatedAt: DateTime,
  deleted: z.boolean().default(false),
  data: z.unknown(),
});
export type SyncRecord = z.infer<typeof SyncRecord>;
