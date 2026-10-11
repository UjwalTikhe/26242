// Contract-typed API client. Every function mirrors a route in
// `contracts/src/api.ts` (paths, methods and payload shapes are 1:1).
// Response wrapper schemas in api.ts are Zod *values* (no matching type
// export), so we derive their TS types via z.infer. These imports are only
// used in type positions and are elided at build time.
import { z } from 'zod';
import type {
  Assessment, AIAnalysis, AssessorReview, Certificate, CompetencyReport,
  Declaration, Decision, Evidence, QPMatch, TaskResponse, WorkerProfile, TradePack,
  DeclarationAnswers,
} from '@sih/contracts';
import {
  AuthSession, MeRes, ProfileRes, AssessmentListRes, PublicPlanRes,
  EvidenceListRes, AnalysisStatusRes, ReviewRes, VerifyRes,
  SyncPushRes, SyncPullRes, TradeListRes as TradeListResSchema,
  HealthRes, FairnessRes,
} from '@sih/contracts';
import { API_BASE } from '../config';
import { api, clientNow } from './api';
import { uuid } from './uuid';

export type AuthSessionT = z.infer<typeof AuthSession>;
export type MeResT = z.infer<typeof MeRes>;
export type ProfileResT = z.infer<typeof ProfileRes>;
export type AssessmentListResT = z.infer<typeof AssessmentListRes>;
export type PublicPlanResT = z.infer<typeof PublicPlanRes>;
export type EvidenceListResT = z.infer<typeof EvidenceListRes>;
export type AnalysisStatusResT = z.infer<typeof AnalysisStatusRes>;
export type ReviewResT = z.infer<typeof ReviewRes>;
export type VerifyResult = z.infer<typeof VerifyRes>;
export type SyncPushResT = z.infer<typeof SyncPushRes>;
export type SyncPullResT = z.infer<typeof SyncPullRes>;
export type TradeListResT = z.infer<typeof TradeListResSchema>;
export type HealthResT = z.infer<typeof HealthRes>;
export type FairnessResT = z.infer<typeof FairnessRes>;

/* ---------------- auth ---------------- */
export const requestOtp = (phone: string) =>
  api<{ sent: true; expiresInSec: number; debugCode?: string }>('/api/v1/auth/otp/request', {
    method: 'POST', body: { phone }, anonymous: true,
  });

export const verifyOtp = (phone: string, code: string, displayName?: string, language = 'en') =>
  api<AuthSessionT>('/api/v1/auth/otp/verify', {
    method: 'POST', body: { phone, code, displayName, language, deviceId: uuid() }, anonymous: true,
  });

export const registerAssessor = (email: string, password: string, displayName: string, role: 'assessor' | 'authorized_assessor' = 'assessor') =>
  api<AuthSessionT>('/api/v1/auth/assessor/register', { method: 'POST', body: { email, password, displayName, role }, anonymous: true });

export const loginAssessor = (email: string, password: string) =>
  api<AuthSessionT>('/api/v1/auth/assessor/login', { method: 'POST', body: { email, password }, anonymous: true });

export const logout = () => api<{ ok: true }>('/api/v1/auth/logout', { method: 'POST' });

export const me = () => api<MeResT>('/api/v1/auth/me');

/* ---------------- profile (LWW) ---------------- */
export const getProfile = () => api<ProfileResT>('/api/v1/profile');

export const updateProfile = (version: number, clientUpdatedAt: string, patch: Partial<WorkerProfile>) =>
  api<ProfileResT>('/api/v1/profile', { method: 'PATCH', body: { version, clientUpdatedAt, patch } });

/* ---------------- assessments ---------------- */
export const createAssessment = (body: { id?: string; language?: string; tradeHint?: string }) =>
  api<Assessment>('/api/v1/assessments', { method: 'POST', body, raw: typeof body.id === 'string' });

export const listAssessments = (query: { status?: string; limit?: number } = {}) =>
  api<AssessmentListResT>(`/api/v1/assessments?limit=${query.limit ?? 50}${query.status ? `&status=${query.status}` : ''}`);

export const getAssessment = (id: string) => api<Assessment>(`/api/v1/assessments/${id}`);

export const submitDeclaration = (id: string, body: { answers: DeclarationAnswers; voiceAnswers?: unknown[]; language?: string; clientUpdatedAt?: string }) =>
  api<Declaration>(`/api/v1/assessments/${id}/declaration`, { method: 'POST', body });

export const getDeclaration = (id: string) => api<Declaration>(`/api/v1/assessments/${id}/declaration`);

export const mapAssessment = (id: string, tradeHint?: string) =>
  api<QPMatch>(`/api/v1/assessments/${id}/map`, { method: 'POST', body: tradeHint ? { tradeHint } : {} });

export const getMapping = (id: string) => api<QPMatch>(`/api/v1/assessments/${id}/mapping`);

export const generatePlan = (id: string, tradePackId?: string) =>
  api<PublicPlanResT>(`/api/v1/assessments/${id}/plan`, { method: 'POST', body: tradePackId ? { tradePackId } : {} });

export const getPlan = (id: string) => api<PublicPlanResT>(`/api/v1/assessments/${id}/plan`);

export const startAssessment = (id: string) => api<Assessment>(`/api/v1/assessments/${id}/start`, { method: 'POST' });

export const submitAnswers = (
  id: string,
  taskId: string,
  answers: { selectedOptionIds?: string[]; checkedItemIds?: string[]; textAnswer?: string },
  clientUpdatedAt?: string,
) =>
  api<{ response: TaskResponse; assessment: Assessment }>(`/api/v1/assessments/${id}/answers`, {
    method: 'POST', body: { taskId, answers, clientUpdatedAt: clientUpdatedAt ?? clientNow() },
  });

export const listAnswers = (id: string) => api<{ items: TaskResponse[] }>(`/api/v1/assessments/${id}/answers`);

export const submitAssessment = (id: string) => api<Assessment>(`/api/v1/assessments/${id}/submit`, { method: 'POST' });

/* ---------------- evidence ---------------- */
export const registerEvidence = (id: string, body: Record<string, unknown>) =>
  api<Evidence>(`/api/v1/assessments/${id}/evidence`, { method: 'POST', body, raw: true });

export const listEvidence = (id: string, limit = 100) =>
  api<EvidenceListResT>(`/api/v1/assessments/${id}/evidence?limit=${limit}`);

export async function evidenceBlob(evidenceId: string): Promise<Blob> {
  const token = localStorage.getItem('dakshsetu.access');
  const res = await fetch(`${API_BASE}/api/v1/evidence/${evidenceId}/content`, {
    headers: { Authorization: token ? `Bearer ${token}` : '' },
  });
  if (!res.ok) throw new Error(`evidence ${evidenceId}: ${res.status}`);
  return res.blob();
}

/* ---------------- analysis / review ---------------- */
export const getAnalysis = (id: string) => api<AIAnalysis>(`/api/v1/assessments/${id}/analysis`);
export const getAnalysisStatus = (id: string) => api<AnalysisStatusResT>(`/api/v1/assessments/${id}/analysis/status`);
export const claimReview = (id: string) => api<Assessment>(`/api/v1/assessments/${id}/review/claim`, { method: 'POST' });
export const submitReview = (id: string, body: Record<string, unknown>) => api<ReviewResT>(`/api/v1/assessments/${id}/review`, { method: 'POST', body });
export const getReview = (id: string) => api<ReviewResT>(`/api/v1/assessments/${id}/review`);
export const assessorQueue = (limit = 30) => api<AssessmentListResT>(`/api/v1/assessor/queue?limit=${limit}`);

/* ---------------- report / decision ---------------- */
export const getReport = (id: string) => api<CompetencyReport>(`/api/v1/assessments/${id}/report`);
export const submitDecision = (id: string, outcome: 'APPROVED' | 'REJECTED', comments?: string) =>
  api<Decision>(`/api/v1/assessments/${id}/decision`, { method: 'POST', body: { outcome, comments } });
export const getDecision = (id: string) => api<Decision>(`/api/v1/assessments/${id}/decision`);
export const getAudit = (id: string, limit = 50) => api<{ items: unknown[] }>(`/api/v1/assessments/${id}/audit?limit=${limit}`);
export const certificatePdfUrl = (certificateId: string) => `/api/v1/certificates/${certificateId}/pdf`;
export const verifyCertificate = (certificateNo: string) => api<VerifyResult>(`/api/v1/verify/${encodeURIComponent(certificateNo)}`, { anonymous: true });

/* ---------------- sync (offline engine) ---------------- */
export interface SyncOpInput {
  opId: string;
  idempotencyKey: string;
  entity: 'profile' | 'declaration' | 'answers';
  action: 'create' | 'update';
  clientUpdatedAt: string;
  version?: number;
  payload: unknown;
}
export const syncPush = (ops: SyncOpInput[]) => api<SyncPushResT>('/api/v1/sync/push', { method: 'POST', body: { ops }, raw: true });
export const syncPull = (cursor?: string, limit = 200) => api<SyncPullResT>(`/api/v1/sync/pull?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);

/* ---------------- trades / meta / admin ---------------- */
export const listTrades = () => api<TradeListResT>('/api/v1/trades');
export const getTrade = (id: string) => api<TradePack>(`/api/v1/trades/${id}`);
export const getHealth = () => api<HealthResT>('/health', { anonymous: true });
export const getFairness = () => api<FairnessResT>('/api/v1/admin/fairness');