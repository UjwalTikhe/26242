/**
 * Shared enums + the assessment status state machine.
 * This file is the authority for allowed transitions — backend enforces,
 * frontend uses canTransition() for optimistic UI.
 */

/* ------------------------------------------------------------------ */
/* Roles & auth                                                        */
/* ------------------------------------------------------------------ */

export const ROLES = ['worker', 'assessor', 'authorized_assessor', 'admin'] as const;
export const Role = { values: ROLES } as const;
export type Role = (typeof ROLES)[number];

/* ------------------------------------------------------------------ */
/* Assessment state machine                                            */
/* ------------------------------------------------------------------ */

export const ASSESSMENT_STATUSES = [
  'DRAFT',
  'DECLARED',
  'MAPPED',
  'PLAN_READY',
  'IN_PROGRESS',
  'SUBMITTED',
  'AI_ANALYZED',
  'UNDER_REVIEW',
  'REASSESS',
  'REVIEWED',
  'APPROVED',
  'REJECTED',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const TERMINAL_STATUSES: readonly AssessmentStatus[] = ['APPROVED', 'REJECTED'];

/**
 * DRAFT → DECLARED → MAPPED → PLAN_READY → IN_PROGRESS → SUBMITTED
 *   → AI_ANALYZED → UNDER_REVIEW → (REVIEWED | REASSESS → IN_PROGRESS)
 *   → APPROVED / REJECTED
 */
export const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, readonly AssessmentStatus[]> = {
  DRAFT: ['DECLARED'],
  DECLARED: ['MAPPED'],
  MAPPED: ['PLAN_READY'],
  PLAN_READY: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  SUBMITTED: ['AI_ANALYZED'],
  AI_ANALYZED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['REVIEWED', 'REASSESS'],
  REASSESS: ['IN_PROGRESS'],
  REVIEWED: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

export function canTransition(from: AssessmentStatus, to: AssessmentStatus): boolean {
  return ASSESSMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses from which a worker may still write answers/evidence. */
export const WORKER_WRITABLE_STATUSES: readonly AssessmentStatus[] = [
  'DRAFT',
  'PLAN_READY',
  'IN_PROGRESS',
  'REASSESS',
];

/* ------------------------------------------------------------------ */
/* Tasks & evidence                                                    */
/* ------------------------------------------------------------------ */

export const TASK_TYPES = [
  'mcq', // safety / theory multiple choice
  'tool_identification', // pick the right tools from a presented set
  'checklist', // worker confirms steps performed (self-report)
  'practical_photo', // photo evidence required
  'practical_video', // video evidence required
  'narration', // think-aloud audio while performing
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const MEDIA_TYPES = ['photo', 'video', 'audio', 'document'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const EVIDENCE_STATUSES = ['received', 'analyzing', 'analyzed', 'error'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* AI analysis                                                         */
/* ------------------------------------------------------------------ */

/** Where an item's score may come from. */
export const ITEM_ROUTINGS = ['auto', 'ai_assist', 'human_required'] as const;
export type ItemRouting = (typeof ITEM_ROUTINGS)[number];

export const FLAG_KINDS = [
  'missing_step',
  'safety_issue',
  'quality',
  'integrity',
  'consistency',
  'process',
] as const;
export type FlagKind = (typeof FLAG_KINDS)[number];

export const SEVERITIES = ['info', 'warn', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const AI_MODES = ['llm', 'fallback', 'mixed'] as const;
export type AiMode = (typeof AI_MODES)[number];

/* ------------------------------------------------------------------ */
/* Review, report, decision                                            */
/* ------------------------------------------------------------------ */

export const REVIEW_ITEM_STATUSES = ['accepted', 'overridden', 'manual'] as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number];

export const REVIEW_OUTCOMES = ['REVIEWED', 'REASSESS'] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export const REPORT_RECOMMENDATIONS = [
  'certify',
  'certify_with_bridge',
  'reassess',
  'not_certified',
] as const;
export type ReportRecommendation = (typeof REPORT_RECOMMENDATIONS)[number];

export const DECISION_OUTCOMES = ['APPROVED', 'REJECTED'] as const;
export type DecisionOutcome = (typeof DECISION_OUTCOMES)[number];

/* ------------------------------------------------------------------ */
/* Offline sync                                                        */
/* ------------------------------------------------------------------ */

export const SYNC_ENTITIES = ['profile', 'declaration', 'answers', 'sensor_readings', 'diagnostic_sessions'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export const SYNC_OP_STATUSES = ['applied', 'duplicate', 'conflict', 'rejected', 'error'] as const;
export type SyncOpStatus = (typeof SYNC_OP_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* HTTP header conventions (our offline-sync contract)                 */
/* ------------------------------------------------------------------ */

export const HEADER_IDEMPOTENCY_KEY = 'Idempotency-Key';
export const HEADER_CLIENT_ID = 'X-Client-Id';
export const HEADER_API_VERSION = 'X-Api-Version';

export const API_VERSION = '1';

/* ------------------------------------------------------------------ */
/* Sensor diagnostics                                                  */
/* ------------------------------------------------------------------ */

export const SENSOR_TYPES = [
  'acoustic',      // Sound/ultrasonic for leak detection
  'pressure',      // Pressure sensors for gas/water lines
  'gas_concentration', // Gas sensors (methane, LPG, CO, etc.)
  'temperature',   // Temperature monitoring
  'uv',            // UV radiation sensor for welding
  'proximity',     // Distance/proximity sensors
  'vibration',     // Vibration/accelerometer
] as const;
export type SensorType = (typeof SENSOR_TYPES)[number];

export const DEVICE_TYPES = ['wearable', 'handheld', 'fixed'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const ALERT_LEVELS = ['safe', 'warning', 'danger', 'critical'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

export const ALERT_TYPES = ['visual', 'audio', 'haptic', 'notification'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const DIAGNOSTIC_SESSION_STATUSES = [
  'active',
  'paused',
  'completed',
  'aborted',
] as const;
export type DiagnosticSessionStatus = (typeof DIAGNOSTIC_SESSION_STATUSES)[number];

export const DIAGNOSTIC_MODES = ['leak_detection', 'welding_hazard', 'general_monitoring'] as const;
export type DiagnosticMode = (typeof DIAGNOSTIC_MODES)[number];
