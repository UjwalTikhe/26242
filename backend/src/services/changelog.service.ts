/**
 * Offline change feed writer (pull side of the sync contract).
 *
 * Deliberately imports nothing but the model + logger so ANY service can
 * depend on it without import cycles (profile, assessment, declaration,
 * answers, evidence all record changes here).
 *
 * Best-effort by design: a feed write failure must not fail the business
 * operation that succeeded — it is logged loudly instead.
 */
import { logger } from '../logger.js';
import { SyncChange } from '../models/sync.models.js';
import { toApi } from '../utils/toApi.js';

export interface ChangeInput {
  /** 'profile' | 'assessment' | 'declaration' | 'answers' | 'evidence' | … */
  entity: string;
  /** Contract record id of the changed entity. */
  id: string;
  /** Worker scope (profile owner / assessment worker). */
  ownerId: string;
  version?: number;
  /** Entity updatedAt (not feed insert time) — client LWW input. */
  updatedAt?: Date;
  deleted?: boolean;
  /** Entity snapshot; serialized to contract shape here. */
  data?: unknown;
}

export async function recordChange(input: ChangeInput): Promise<void> {
  try {
    await SyncChange.create({
      entity: input.entity,
      id: input.id,
      ownerId: input.ownerId,
      version: input.version,
      updatedAt: input.updatedAt ?? new Date(),
      deleted: input.deleted ?? false,
      data: input.data === undefined ? undefined : toApi(input.data),
      at: new Date(),
    });
  } catch (err) {
    logger.error({ err, entity: input.entity, id: input.id }, 'sync change-feed write failed');
  }
}
