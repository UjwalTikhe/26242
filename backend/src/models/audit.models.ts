/**
 * Append-only audit log (tamper-evident hash chain), scoped per assessment.
 *
 * Every entry links to the previous one via `prevHash` and commits to its own
 * content via `payloadHash`; `hash = sha256(prevHash:payloadHash)`. Because the
 * chain is scoped, `/assessments/:id/audit` is a self-contained verifiable
 * sequence (seq starts at 1, genesis prevHash = 64 zeros).
 */
import { Schema, model } from 'mongoose';

export interface AuditLogDoc {
  _id: string;
  /** Chain scope — the assessment id (keeps each audit trail independent). */
  scope: string;
  seq: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorRole?: string;
  data?: Record<string, unknown>;
  prevHash: string;
  payloadHash: string;
  hash: string;
  at: Date;
}

const auditLogSchema = new Schema<AuditLogDoc>(
  {
    _id: { type: String, required: true },
    scope: { type: String, required: true },
    seq: { type: Number, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    action: { type: String, required: true },
    actorId: { type: String },
    actorRole: { type: String },
    data: { type: Schema.Types.Mixed },
    prevHash: { type: String, required: true },
    payloadHash: { type: String, required: true },
    hash: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false, minimize: false },
);
auditLogSchema.index({ scope: 1, seq: 1 }, { unique: true });

export const AuditLog = model<AuditLogDoc>('AuditLog', auditLogSchema);
