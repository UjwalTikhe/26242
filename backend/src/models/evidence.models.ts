/**
 * Evidence model — append-only artifact metadata (bytes live in storage).
 *
 * Append-order: `seq` increments within (assessmentId, taskId, round) and is
 * guarded by a unique index. Tamper-evidence: `integrity.chainHash` links each
 * record to the previous one per assessment (SHA-256 chain, computed under an
 * in-process per-assessment lock).
 */
import { Schema, model, type HydratedDocument } from 'mongoose';
import { EVIDENCE_STATUSES, LANGUAGES, MEDIA_TYPES } from '@sih/contracts';

export interface EvidenceGpsDoc {
  lat: number;
  lng: number;
  accuracy?: number;
  source?: 'gps' | 'network' | 'manual';
}

export interface EvidenceNarrationDoc {
  text: string;
  language?: string;
  source: 'asr' | 'client';
  confirmed: boolean;
  provider?: string;
}

export interface EvidenceIntegrityDoc {
  /** Server-computed SHA-256 of stored bytes. */
  serverSha256: string;
  /** Device-computed hash at capture time. */
  clientSha256?: string;
  hashVerified: boolean;
  chainPrev?: string;
  chainHash?: string;
}

export interface EvidenceDoc {
  _id: string;
  assessmentId: string;
  taskId?: string;
  workerId: string;
  round: number;
  seq: number;
  kind: (typeof MEDIA_TYPES)[number];
  storageKey: string;
  sizeBytes: number;
  mimeType?: string;
  capturedAt: Date;
  deviceId?: string;
  appVersion?: string;
  gps?: EvidenceGpsDoc;
  language?: (typeof LANGUAGES)[number];
  narration?: EvidenceNarrationDoc;
  status: (typeof EVIDENCE_STATUSES)[number];
  integrity: EvidenceIntegrityDoc;
  createdAt: Date;
  updatedAt: Date;
}

const gpsSchema = new Schema<EvidenceGpsDoc>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    accuracy: { type: Number },
    source: { type: String, enum: ['gps', 'network', 'manual'] },
  },
  { _id: false },
);

const narrationSchema = new Schema<EvidenceNarrationDoc>(
  {
    text: { type: String, required: true },
    language: { type: String, enum: LANGUAGES },
    source: { type: String, enum: ['asr', 'client'], required: true },
    confirmed: { type: Boolean, required: true, default: false },
    provider: { type: String },
  },
  { _id: false },
);

const integritySchema = new Schema<EvidenceIntegrityDoc>(
  {
    serverSha256: { type: String, required: true },
    clientSha256: { type: String },
    hashVerified: { type: Boolean, required: true, default: false },
    chainPrev: { type: String },
    chainHash: { type: String },
  },
  { _id: false },
);

const evidenceSchema = new Schema<EvidenceDoc>(
  {
    _id: { type: String, required: true },
    assessmentId: { type: String, required: true },
    taskId: { type: String },
    workerId: { type: String, required: true },
    round: { type: Number, default: 1, min: 1 },
    seq: { type: Number, required: true, min: 0 },
    kind: { type: String, enum: MEDIA_TYPES, required: true },
    storageKey: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 0 },
    mimeType: { type: String },
    capturedAt: { type: Date, required: true },
    deviceId: { type: String },
    appVersion: { type: String },
    gps: { type: gpsSchema },
    language: { type: String, enum: LANGUAGES },
    narration: { type: narrationSchema },
    status: { type: String, enum: EVIDENCE_STATUSES, default: 'received' },
    integrity: { type: integritySchema, required: true },
  },
  // keep empty nested objects (gps/narration edge cases) — see assessment models
  { timestamps: true, versionKey: false, minimize: false },
);

// one storage object → one evidence record (dedupe for tus-finish + JSON double path)
evidenceSchema.index({ storageKey: 1 }, { unique: true });
// append-order within (assessment, task, round); missing taskId indexes as null
evidenceSchema.index({ assessmentId: 1, taskId: 1, round: 1, seq: 1 }, { unique: true });
evidenceSchema.index({ assessmentId: 1, createdAt: 1 });
evidenceSchema.index({ workerId: 1, createdAt: -1 });

export const Evidence = model<EvidenceDoc>('Evidence', evidenceSchema);
export type EvidenceDocument = HydratedDocument<EvidenceDoc>;
