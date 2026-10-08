/**
 * Offline-sync collections:
 *
 * - SyncChange  — append-only change feed; pull = changes since an ObjectId
 *   cursor, scoped to the owning worker (assessors don't pull).
 * - IdempotencyLog — memoized results of push ops, keyed per
 *   (owner, idempotencyKey); replays return the stored result.
 */
import { Schema, model, type Types } from 'mongoose';

/* ------------------------------------------------------------------ */
/* Change feed                                                         */
/* ------------------------------------------------------------------ */

export interface SyncChangeDoc {
  _id: Types.ObjectId;
  entity: string;
  /** Record id (contract Id) of the changed entity. */
  id: string;
  /** Worker scope — who is allowed to pull this change. */
  ownerId: string;
  version?: number;
  updatedAt: Date;
  deleted: boolean;
  /** Full contract-shaped snapshot (SyncRecord.data) for client upsert. */
  data?: unknown;
  /** Feed insert time (cursor position is _id, monotonic with insert). */
  at: Date;
}

const syncChangeSchema = new Schema<SyncChangeDoc>(
  {
    entity: { type: String, required: true },
    id: { type: String, required: true },
    ownerId: { type: String, required: true },
    version: { type: Number },
    updatedAt: { type: Date, required: true },
    deleted: { type: Boolean, default: false },
    data: { type: Schema.Types.Mixed },
    at: { type: Date, required: true },
  },
  { versionKey: false },
);
syncChangeSchema.index({ ownerId: 1, _id: 1 });
syncChangeSchema.index({ entity: 1, id: 1 });

export const SyncChange = model<SyncChangeDoc>('SyncChange', syncChangeSchema);

/* ------------------------------------------------------------------ */
/* Idempotency log                                                     */
/* ------------------------------------------------------------------ */

export type IdempotentStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'error';

export interface IdempotencyLogDoc {
  _id: Types.ObjectId;
  opId: string;
  ownerId: string;
  idempotencyKey: string;
  entity: string;
  action: string;
  status: IdempotentStatus;
  serverVersion?: number;
  message?: string;
  appliedAt: Date;
}

const idempotencySchema = new Schema<IdempotencyLogDoc>(
  {
    opId: { type: String, required: true },
    ownerId: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    entity: { type: String, required: true },
    action: { type: String, required: true },
    status: { type: String, enum: ['applied', 'duplicate', 'conflict', 'rejected', 'error'], required: true },
    serverVersion: { type: Number },
    message: { type: String },
    appliedAt: { type: Date, required: true },
  },
  { versionKey: false },
);
// replay = same key from the same worker → same stored result
idempotencySchema.index({ ownerId: 1, idempotencyKey: 1 }, { unique: true });
idempotencySchema.index({ appliedAt: 1 }); // retention sweeps later

export const IdempotencyLog = model<IdempotencyLogDoc>('IdempotencyLog', idempotencySchema);
