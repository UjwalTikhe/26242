/**
 * State machine helper — the single place transitions are enforced.
 * The table lives in @sih/contracts (frontend uses the same one for
 * optimistic UI), so backend and frontend can never disagree.
 */
import { canTransition, type AssessmentStatus } from '@sih/contracts';
import { conflict } from '../errors.js';

export function assertTransition(from: AssessmentStatus, to: AssessmentStatus): void {
  if (from === to) return; // idempotent: already at target (offline replay)
  if (!canTransition(from, to)) {
    throw conflict('invalid_transition', `Cannot transition ${from} → ${to}`, {
      from,
      to,
      allowed: canTransition(from, to),
    });
  }
}
