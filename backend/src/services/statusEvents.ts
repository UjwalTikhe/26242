/**
 * Shared side effects for an assessment status change: append the audit entry
 * and push the real-time `assessment:status` event.
 *
 * Most services call `transitionAssessment` (which delegates here), but the
 * declaration/mapping/plan services each do a bespoke conditional update to win
 * a race — they call this directly so the audit trail and live updates stay
 * complete regardless of which path advanced the status.
 */
import { recordAudit } from './audit.service.js';
import { emitToAssessment, emitToUser } from '../realtime/index.js';

export interface StatusEventInput {
  assessmentId: string;
  from?: string;
  to: string;
  workerId: string;
  version: number;
  round: number;
  actorId?: string;
  actorRole?: string;
  data?: Record<string, unknown>;
}

export async function onStatusChanged(input: StatusEventInput): Promise<void> {
  await recordAudit({
    scope: input.assessmentId,
    entityType: 'assessment',
    entityId: input.assessmentId,
    action: `status:${input.to}`,
    actorId: input.actorId,
    actorRole: input.actorRole,
    data: { from: input.from, to: input.to, ...(input.data ?? {}) },
  });

  const payload = {
    assessmentId: input.assessmentId,
    status: input.to,
    from: input.from,
    round: input.round,
    version: input.version,
    at: new Date().toISOString(),
  };
  emitToAssessment(input.assessmentId, 'assessment:status', payload);
  emitToUser(input.workerId, 'assessment:status', payload);
}
