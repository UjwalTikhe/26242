/**
 * API request/response schemas + the route registry.
 * `routes` is the single list that generates openapi.json and documents
 * auth requirements per endpoint for Person A.
 */
import { z } from 'zod';
import {
  DateTime,
  Id,
  IdempotencyKey,
  Language,
  PageQuery,
  paginated,
} from './common.js';
import {
  ASSESSMENT_STATUSES,
  ROLES,
  SYNC_ENTITIES,
} from './enums.js';
import {
  AIAnalysis,
  Assessment,
  AssessorReview,
  AuditLogEntry,
  Certificate,
  CompetencyReport,
  Declaration,
  Decision,
  // Device,
  // DeviceAlert,
  // DiagnosticSession,
  Evidence,
  QPMatch,
  AssessmentPlan,
  PublicTask,
  // SafetyThreshold,
  // SensorReading,
  SyncRecord,
  TaskAnswers,
  TaskResponse,
  User,
  WorkerProfile,
  DeclarationAnswers,
  VoiceAnswer,
} from './entities.js';
import { TradePack } from './tradepack.js';

/* ================================================================== */
/* Auth                                                                */
/* ================================================================== */

export const RequestOtpReq = z.object({
  phone: z.string().regex(/^\+?[0-9]{8,15}$/, 'E.164-like phone number'),
});
export const RequestOtpRes = z.object({
  sent: z.literal(true),
  expiresInSec: z.number().int(),
  /** Only present for the mock provider / non-production environments. */
  debugCode: z.string().optional(),
});

export const VerifyOtpReq = z.object({
  phone: z.string().regex(/^\+?[0-9]{8,15}$/),
  code: z.string().min(4).max(10),
  deviceId: z.string().optional(),
  language: Language.optional(),
  /** First-login profile bootstrap. */
  displayName: z.string().optional(),
});
export const AuthTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSec: z.number().int(),
});
export const AuthSession = z.object({
  user: User,
  tokens: AuthTokens,
});
export const VerifyOtpRes = AuthSession;

export const AssessorRegisterReq = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1),
  role: z.enum(['assessor', 'authorized_assessor']).default('assessor'),
});
export const AssessorLoginReq = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const RefreshReq = z.object({ refreshToken: z.string().min(10) });
export const AuthSessionRes = AuthSession;
export const MeRes = z.object({ user: User, profile: WorkerProfile.optional() });

/* ================================================================== */
/* Worker profile                                                      */
/* ================================================================== */

export const UpdateProfileReq = z.object({
  /** Last-write-wins: client's known version of the record. */
  version: z.number().int().min(0),
  clientUpdatedAt: DateTime,
  patch: WorkerProfile.partial().omit({
    id: true,
    userId: true,
    createdAt: true,
    updatedAt: true,
    version: true,
    clientUpdatedAt: true,
  }),
});
export const ProfileRes = WorkerProfile;
export const ConflictRes = z.object({
  error: z.literal('version_conflict'),
  server: WorkerProfile,
  message: z.string(),
});

/* ================================================================== */
/* Assessments                                                         */
/* ================================================================== */

export const CreateAssessmentReq = z.object({
  /** Client-generated UUID (offline creation). */
  id: Id.optional(),
  language: Language.default('en'),
  /** Optional pre-selected trade; mapping can still override. */
  tradeHint: z.string().optional(),
});
export const AssessmentRes = Assessment;
export const AssessmentListRes = paginated(Assessment);
export const ListQuery = PageQuery.extend({
  status: z.enum(ASSESSMENT_STATUSES).optional(),
  workerId: Id.optional(),
});

export const SubmitDeclarationReq = z.object({
  answers: DeclarationAnswers,
  voiceAnswers: z.array(VoiceAnswer).default([]),
  language: Language.default('en'),
  clientUpdatedAt: DateTime.optional(),
});
export const DeclarationRes = Declaration;

export const MapReq = z.object({
  /** Optional hint from the worker's selected trade. */
  tradeHint: z.string().optional(),
});
export const QPMatchRes = QPMatch;

export const GeneratePlanReq = z.object({
  /** Defaults to the top mapping candidate. */
  tradePackId: z.string().optional(),
});
export const PlanRes = AssessmentPlan;
export const PublicPlanRes = AssessmentPlan.omit({ tasks: true }).extend({
  tasks: z.array(PublicTask),
});

export const StartAssessmentRes = Assessment;

export const SubmitAnswersReq = z.object({
  taskId: Id,
  answers: TaskAnswers,
  clientUpdatedAt: DateTime.optional(),
});
export const TaskResponseRes = TaskResponse;
export const SubmitAnswersRes = z.object({
  response: TaskResponse,
  assessment: Assessment,
});

export const SubmitAssessmentRes = Assessment;

/* ================================================================== */
/* Evidence / uploads                                                  */
/* ================================================================== */

export const EvidenceListRes = paginated(Evidence);
export const EvidenceRes = Evidence;

/** JSON registration for tiny artifacts / after tus completion metadata. */
export const RegisterEvidenceReq = z.object({
  taskId: Id.optional(),
  kind: z.enum(['photo', 'video', 'audio', 'document']),
  sizeBytes: z.number().int().min(0),
  mimeType: z.string().optional(),
  capturedAt: DateTime,
  /** SHA-256 computed on-device at capture time (Web Crypto). */
  clientSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  deviceId: z.string().optional(),
  appVersion: z.string().optional(),
  gps: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracy: z.number().optional(),
      source: z.enum(['gps', 'network', 'manual']).optional(),
    })
    .optional(),
  language: Language.optional(),
  narrationText: z.string().optional(),
  narrationSource: z.enum(['asr', 'client']).optional(),
  storageKey: z.string().optional(),
});

/* ================================================================== */
/* AI analysis / review                                                */
/* ================================================================== */

export const AnalysisRes = AIAnalysis;
export const AnalysisStatusRes = z.object({
  state: z.enum(['queued', 'running', 'done', 'error', 'none']),
  queuedAt: DateTime.optional(),
  message: z.string().optional(),
});

export const ClaimReviewRes = Assessment;

export const ReviewSubmitReq = z.object({
  items: z
    .array(
      z.object({
        taskId: Id,
        finalScore: z.number().min(0).max(1),
        /** true = assessor keeps the AI score as-is */
        acceptAi: z.boolean().default(false),
        comment: z.string().optional(),
      }),
    )
    .min(1),
  overallComment: z.string().optional(),
  outcome: z.enum(['REVIEWED', 'REASSESS']).default('REVIEWED'),
  reassessmentTasks: z
    .array(z.object({ taskId: Id, reason: z.string().min(1) }))
    .default([]),
});
export const ReviewRes = AssessorReview;

/* ================================================================== */
/* Report / decision / certificate                                     */
/* ================================================================== */

export const ReportRes = CompetencyReport;
export const DecisionReq = z.object({
  outcome: z.enum(['APPROVED', 'REJECTED']),
  comments: z.string().optional(),
});
export const DecisionRes = Decision;
export const CertificateRes = Certificate;
export const AuditLogRes = paginated(AuditLogEntry);

/** Public, unauthenticated certificate verification payload. */
export const VerifyRes = z.object({
  valid: z.boolean(),
  reason: z.string().optional(),
  certificate: Certificate.optional(),
  holder: z.object({ name: z.string(), trade: z.string(), nsqfLevel: z.number().int() }).optional(),
  assessment: z
    .object({ overallScore: z.number(), decidedAt: DateTime, status: z.enum(ASSESSMENT_STATUSES) })
    .optional(),
});

/* ================================================================== */
/* Sync (offline engine)                                               */
/* ================================================================== */

export const SyncPushReq = z.object({
  ops: z
    .array(
      z.object({
        opId: Id,
        idempotencyKey: IdempotencyKey,
        entity: z.enum(SYNC_ENTITIES),
        action: z.enum(['create', 'update']),
        clientUpdatedAt: DateTime,
        version: z.number().int().min(0).optional(),
        payload: z.unknown(),
      }),
    )
    .min(1)
    .max(200),
});
export const SyncPushRes = z.object({
  results: z.array(
    z.object({
      opId: Id,
      status: z.enum(['applied', 'duplicate', 'conflict', 'rejected', 'error']),
      serverVersion: z.number().int().optional(),
      message: z.string().optional(),
    }),
  ),
  serverTime: DateTime,
});
export const SyncPullQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export const SyncPullRes = z.object({
  changes: z.array(SyncRecord),
  nextCursor: z.string().optional(),
  hasMore: z.boolean(),
  serverTime: DateTime,
});

/* ================================================================== */
/* Sensor diagnostics (temporarily disabled)                              */
/* ================================================================== */

// export const RegisterDeviceReq = z.object({
//   deviceId: z.string(),
//   serialNumber: z.string().optional(),
//   type: z.enum(['wearable', 'handheld', 'fixed']),
//   name: z.string(),
//   sensors: z.array(z.enum(['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration'])),
//   associatedTrades: z.array(z.string()).default([]),
//   firmwareVersion: z.string().optional(),
// });
// export const DeviceRes = Device;
// export const DeviceListRes = paginated(Device);

// export const CreateDiagnosticSessionReq = z.object({
//   deviceId: z.string(),
//   mode: z.enum(['leak_detection', 'welding_hazard', 'general_monitoring']),
//   trade: z.string().optional(),
//   scenario: z.string().optional(),
//   assessmentId: z.string().optional(),
// });
// export const DiagnosticSessionRes = DiagnosticSession;
// export const DiagnosticSessionListRes = paginated(DiagnosticSession);

// export const SensorReadingReq = z.object({
//   sessionId: z.string(),
//   sensorType: z.enum(['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration']),
//   unit: z.string(),
//   value: z.number(),
//   rawValue: z.number().optional(),
//   location: z
//     .object({
//       lat: z.number(),
//       lng: z.number(),
//       accuracy: z.number().optional(),
//     })
//     .optional(),
//   accuracy: z.number().min(0).max(1).optional(),
//   timestamp: z.string().datetime(),
// });
// export const SensorReadingRes = SensorReading;
// export const SensorReadingListRes = paginated(SensorReading);

// export const SafetyThresholdRes = SafetyThreshold;
// export const SafetyThresholdListRes = paginated(SafetyThreshold);

// export const DeviceAlertRes = DeviceAlert;
// export const DeviceAlertListRes = paginated(DeviceAlert);

// export const SessionSummaryReq = z.object({
//   sessionId: z.string(),
//   trainerNotes: z.string().optional(),
// });
// export const SessionSummaryRes = DiagnosticSession;

/* ================================================================== */
/* Trades / meta / admin                                               */
/* ================================================================== */

export const TradeListRes = z.object({
  items: z.array(
    TradePack.pick({
      id: true,
      title: true,
      aliases: true,
      qp: true,
    }),
  ),
});
export const TradePackRes = TradePack;

export const HealthRes = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  version: z.string(),
  time: DateTime,
  checks: z.record(z.string(), z.object({ status: z.string(), detail: z.string().optional() })),
});

export const FairnessRes = z.object({
  buckets: z.array(
    z.object({
      dimension: z.enum(['language', 'gender', 'region']),
      value: z.string(),
      count: z.number().int(),
      avgScore: z.number(),
      approvalRate: z.number(),
    }),
  ),
  note: z.string(),
});

/* ================================================================== */
/* Route registry (drives openapi.json)                                */
/* ================================================================== */

export type RouteAuth = 'public' | 'worker' | 'assessor' | 'authorized_assessor' | 'any';

export interface RouteDef {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  tag: string;
  summary: string;
  auth: RouteAuth;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  bodyRequired?: boolean;
  response: z.ZodType;
  status?: number;
}

export const routes: RouteDef[] = [
  // meta
  { method: 'get', path: '/health', tag: 'meta', summary: 'Liveness + dependency checks', auth: 'public', response: HealthRes },

  // auth
  { method: 'post', path: '/api/v1/auth/otp/request', tag: 'auth', summary: 'Request phone OTP', auth: 'public', body: RequestOtpReq, bodyRequired: true, response: RequestOtpRes },
  { method: 'post', path: '/api/v1/auth/otp/verify', tag: 'auth', summary: 'Verify OTP, get session', auth: 'public', body: VerifyOtpReq, bodyRequired: true, response: VerifyOtpRes },
  { method: 'post', path: '/api/v1/auth/assessor/register', tag: 'auth', summary: 'Register assessor (email+password)', auth: 'public', body: AssessorRegisterReq, bodyRequired: true, response: AuthSessionRes },
  { method: 'post', path: '/api/v1/auth/assessor/login', tag: 'auth', summary: 'Assessor login', auth: 'public', body: AssessorLoginReq, bodyRequired: true, response: AuthSessionRes },
  { method: 'post', path: '/api/v1/auth/refresh', tag: 'auth', summary: 'Refresh tokens', auth: 'public', body: RefreshReq, bodyRequired: true, response: AuthSessionRes },
  { method: 'post', path: '/api/v1/auth/logout', tag: 'auth', summary: 'Revoke refresh token', auth: 'any', response: z.object({ ok: z.literal(true) }) },
  { method: 'get', path: '/api/v1/auth/me', tag: 'auth', summary: 'Current user + profile', auth: 'any', response: MeRes },

  // profile
  { method: 'get', path: '/api/v1/profile', tag: 'profile', summary: 'Get own worker profile', auth: 'worker', response: ProfileRes },
  { method: 'patch', path: '/api/v1/profile', tag: 'profile', summary: 'Update profile (LWW + version)', auth: 'worker', body: UpdateProfileReq, bodyRequired: true, response: ProfileRes, status: 200 },

  // assessments
  { method: 'post', path: '/api/v1/assessments', tag: 'assessments', summary: 'Create assessment (DRAFT)', auth: 'worker', body: CreateAssessmentReq, bodyRequired: true, response: AssessmentRes, status: 201 },
  { method: 'get', path: '/api/v1/assessments', tag: 'assessments', summary: 'List assessments (role-scoped)', auth: 'any', query: ListQuery, response: AssessmentListRes },
  { method: 'get', path: '/api/v1/assessments/:id', tag: 'assessments', summary: 'Get assessment + status history', auth: 'any', params: z.object({ id: Id }), response: AssessmentRes },

  { method: 'post', path: '/api/v1/assessments/:id/declaration', tag: 'declaration', summary: 'Submit self-declaration → DECLARED', auth: 'worker', params: z.object({ id: Id }), body: SubmitDeclarationReq, bodyRequired: true, response: DeclarationRes, status: 201 },
  { method: 'get', path: '/api/v1/assessments/:id/declaration', tag: 'declaration', summary: 'Get declaration', auth: 'any', params: z.object({ id: Id }), response: DeclarationRes },

  { method: 'post', path: '/api/v1/assessments/:id/map', tag: 'mapping', summary: 'AI NSQF mapping, top-3 → MAPPED', auth: 'worker', params: z.object({ id: Id }), body: MapReq, bodyRequired: false, response: QPMatchRes },
  { method: 'get', path: '/api/v1/assessments/:id/mapping', tag: 'mapping', summary: 'Get QP match', auth: 'any', params: z.object({ id: Id }), response: QPMatchRes },

  { method: 'post', path: '/api/v1/assessments/:id/plan', tag: 'plan', summary: 'Generate assessment plan → PLAN_READY', auth: 'worker', params: z.object({ id: Id }), body: GeneratePlanReq, bodyRequired: false, response: PlanRes, status: 201 },
  { method: 'get', path: '/api/v1/assessments/:id/plan', tag: 'plan', summary: 'Get plan (answer key stripped for workers)', auth: 'any', params: z.object({ id: Id }), response: PublicPlanRes },

  { method: 'post', path: '/api/v1/assessments/:id/start', tag: 'assessments', summary: 'Start / resume → IN_PROGRESS', auth: 'worker', params: z.object({ id: Id }), response: StartAssessmentRes },
  { method: 'post', path: '/api/v1/assessments/:id/answers', tag: 'assessments', summary: 'Submit task answers (auto-scored)', auth: 'worker', params: z.object({ id: Id }), body: SubmitAnswersReq, bodyRequired: true, response: SubmitAnswersRes },
  { method: 'get', path: '/api/v1/assessments/:id/answers', tag: 'assessments', summary: 'List task responses', auth: 'any', params: z.object({ id: Id }), response: z.object({ items: z.array(TaskResponse) }) },
  { method: 'post', path: '/api/v1/assessments/:id/submit', tag: 'assessments', summary: 'Submit assessment → SUBMITTED, queues AI', auth: 'worker', params: z.object({ id: Id }), response: SubmitAssessmentRes },

  // evidence
  { method: 'post', path: '/api/v1/assessments/:id/evidence', tag: 'evidence', summary: 'Register evidence metadata', auth: 'worker', params: z.object({ id: Id }), body: RegisterEvidenceReq, bodyRequired: true, response: EvidenceRes, status: 201 },
  { method: 'get', path: '/api/v1/assessments/:id/evidence', tag: 'evidence', summary: 'List evidence', auth: 'any', params: z.object({ id: Id }), query: PageQuery, response: EvidenceListRes },
  { method: 'get', path: '/api/v1/evidence/:id/content', tag: 'evidence', summary: 'Stream evidence bytes', auth: 'any', params: z.object({ id: Id }), response: z.unknown() },

  // AI analysis + review
  { method: 'get', path: '/api/v1/assessments/:id/analysis', tag: 'analysis', summary: 'Get AI analysis', auth: 'any', params: z.object({ id: Id }), response: AnalysisRes },
  { method: 'get', path: '/api/v1/assessments/:id/analysis/status', tag: 'analysis', summary: 'Pipeline status', auth: 'any', params: z.object({ id: Id }), response: AnalysisStatusRes },
  { method: 'post', path: '/api/v1/assessments/:id/review/claim', tag: 'review', summary: 'Assessor claims review → UNDER_REVIEW', auth: 'assessor', params: z.object({ id: Id }), response: ClaimReviewRes },
  { method: 'post', path: '/api/v1/assessments/:id/review', tag: 'review', summary: 'Submit review (accept/override) → REVIEWED|REASSESS', auth: 'assessor', params: z.object({ id: Id }), body: ReviewSubmitReq, bodyRequired: true, response: ReviewRes },
  { method: 'get', path: '/api/v1/assessments/:id/review', tag: 'review', summary: 'Get latest review', auth: 'any', params: z.object({ id: Id }), response: ReviewRes },
  { method: 'get', path: '/api/v1/assessor/queue', tag: 'review', summary: 'Assessor queue', auth: 'assessor', query: PageQuery, response: AssessmentListRes },

  // report / decision / certificate
  { method: 'get', path: '/api/v1/assessments/:id/report', tag: 'report', summary: 'Competency report', auth: 'any', params: z.object({ id: Id }), response: ReportRes },
  { method: 'post', path: '/api/v1/assessments/:id/decision', tag: 'report', summary: 'Final approval → APPROVED|REJECTED', auth: 'authorized_assessor', params: z.object({ id: Id }), body: DecisionReq, bodyRequired: true, response: DecisionRes },
  { method: 'get', path: '/api/v1/assessments/:id/decision', tag: 'report', summary: 'Get decision', auth: 'any', params: z.object({ id: Id }), response: DecisionRes },
  { method: 'get', path: '/api/v1/certificates/:id/pdf', tag: 'report', summary: 'Certificate PDF (QR)', auth: 'any', params: z.object({ id: Id }), response: z.unknown() },
  { method: 'get', path: '/api/v1/assessments/:id/audit', tag: 'report', summary: 'Tamper-evident audit trail', auth: 'assessor', params: z.object({ id: Id }), query: PageQuery, response: paginated(AuditLogEntry) },
  { method: 'get', path: '/api/v1/verify/:certificateNo', tag: 'report', summary: 'Public certificate verification', auth: 'public', params: z.object({ certificateNo: z.string() }), response: VerifyRes },

  // sync
  { method: 'post', path: '/api/v1/sync/push', tag: 'sync', summary: 'Push offline ops (idempotent, LWW)', auth: 'worker', body: SyncPushReq, bodyRequired: true, response: SyncPushRes },
  { method: 'get', path: '/api/v1/sync/pull', tag: 'sync', summary: 'Pull changes since cursor', auth: 'worker', query: SyncPullQuery, response: SyncPullRes },

  // trades
  { method: 'get', path: '/api/v1/trades', tag: 'trades', summary: 'List trade packs', auth: 'public', response: TradeListRes },
  { method: 'get', path: '/api/v1/trades/:id', tag: 'trades', summary: 'Full trade pack (QP/NOS/rubric)', auth: 'public', params: z.object({ id: z.string() }), response: TradePackRes },

  // admin
  { method: 'get', path: '/api/v1/admin/fairness', tag: 'admin', summary: 'Fairness stats by language/gender/region', auth: 'assessor', query: PageQuery, response: FairnessRes },

  // sensor diagnostics (temporarily disabled - will add back after fixing TS errors)
  // { method: 'post', path: '/api/v1/devices', tag: 'sensors', summary: 'Register diagnostic device', auth: 'any', body: RegisterDeviceReq, bodyRequired: true, response: DeviceRes, status: 201 },
  // { method: 'get', path: '/api/v1/devices', tag: 'sensors', summary: 'List registered devices', auth: 'any', query: PageQuery, response: DeviceListRes },
  // { method: 'get', path: '/api/v1/devices/:id', tag: 'sensors', summary: 'Get device details', auth: 'any', params: z.object({ id: Id }), response: DeviceRes },
  // { method: 'patch', path: '/api/v1/devices/:id', tag: 'sensors', summary: 'Update device status/battery', auth: 'any', params: z.object({ id: Id }), body: z.object({ batteryLevel: z.number().min(0).max(100).optional(), isActive: z.boolean().optional() }), response: DeviceRes },
  // { method: 'post', path: '/api/v1/diagnostic-sessions', tag: 'sensors', summary: 'Create diagnostic session', auth: 'worker', body: CreateDiagnosticSessionReq, bodyRequired: true, response: DiagnosticSessionRes, status: 201 },
  // { method: 'get', path: '/api/v1/diagnostic-sessions', tag: 'sensors', summary: 'List diagnostic sessions', auth: 'any', query: PageQuery, response: DiagnosticSessionListRes },
  // { method: 'get', path: '/api/v1/diagnostic-sessions/:id', tag: 'sensors', summary: 'Get diagnostic session', auth: 'any', params: z.object({ id: Id }), response: DiagnosticSessionRes },
  // { method: 'post', path: '/api/v1/diagnostic-sessions/:id/complete', tag: 'sensors', summary: 'Complete diagnostic session', auth: 'worker', params: z.object({ id: Id }), response: DiagnosticSessionRes },
  // { method: 'post', path: '/api/v1/diagnostic-sessions/:id/summary', tag: 'sensors', summary: 'Add trainer summary/notes', auth: 'assessor', params: z.object({ id: Id }), body: SessionSummaryReq, bodyRequired: false, response: SessionSummaryRes },
  // { method: 'post', path: '/api/v1/sensor-readings', tag: 'sensors', summary: 'Submit sensor reading', auth: 'worker', body: SensorReadingReq, bodyRequired: true, response: SensorReadingRes, status: 201 },
  // { method: 'get', path: '/api/v1/sensor-readings', tag: 'sensors', summary: 'List sensor readings', auth: 'any', query: PageQuery.extend({ sessionId: Id.optional(), deviceId: Id.optional() }), response: SensorReadingListRes },
  // { method: 'get', path: '/api/v1/diagnostic-sessions/:id/readings', tag: 'sensors', summary: 'Get readings for a session', auth: 'any', params: z.object({ id: Id }), query: PageQuery, response: SensorReadingListRes },
  // { method: 'get', path: '/api/v1/safety-thresholds', tag: 'sensors', summary: 'List safety thresholds', auth: 'public', query: PageQuery.extend({ sensorType: z.enum(['acoustic', 'pressure', 'gas_concentration', 'temperature', 'uv', 'proximity', 'vibration']).optional(), tradePackId: z.string().optional() }), response: SafetyThresholdListRes },
  // { method: 'get', path: '/api/v1/safety-thresholds/:id', tag: 'sensors', summary: 'Get safety threshold', auth: 'public', params: z.object({ id: Id }), response: SafetyThresholdRes },
  // { method: 'get', path: '/api/v1/diagnostic-sessions/:id/alerts', tag: 'sensors', summary: 'Get alerts for a session', auth: 'any', params: z.object({ id: Id }), query: PageQuery, response: DeviceAlertListRes },
  // { method: 'post', path: '/api/v1/device-alerts/:id/acknowledge', tag: 'sensors', summary: 'Acknowledge device alert', auth: 'worker', params: z.object({ id: Id }), response: DeviceAlertRes },
];
