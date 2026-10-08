/**
 * Worker profile model (last-write-wins via `version` + `clientUpdatedAt`).
 */
import { Schema, model, type HydratedDocument } from 'mongoose';
import { LANGUAGES, type LanguageCode } from '@sih/contracts';

export interface WorkerProfileDoc {
  _id: string;
  userId: string;
  phone?: string;
  fullName: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  dateOfBirth?: string;
  language: LanguageCode;
  region: { state?: string; district?: string; pin?: string };
  trades: string[];
  yearsExperience: number;
  photoStorageKey?: string;
  version: number;
  clientUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Subschema (not inline paths) so `region` can carry a document-level default
// and always serialize as the contract's `region: {}` shape.
const regionSchema = new Schema(
  { state: { type: String }, district: { type: String }, pin: { type: String } },
  { _id: false, id: false },
);

const workerProfileSchema = new Schema<WorkerProfileDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    phone: { type: String },
    fullName: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
    dateOfBirth: { type: String },
    language: { type: String, enum: LANGUAGES, default: 'en' },
    region: { type: regionSchema, default: () => ({}) },
    trades: { type: [String], default: [] },
    yearsExperience: { type: Number, default: 0, min: 0, max: 60 },
    photoStorageKey: { type: String },
    version: { type: Number, default: 0 },
    clientUpdatedAt: { type: Date },
  },
  { timestamps: true, versionKey: false, minimize: false },
);
workerProfileSchema.index({ userId: 1 }, { unique: true });

// Contract requires `region: {}` on the wire. Two safeguards: minimize:false
// (mongoose otherwise deletes empty objects at save) and a validate hook in
// case the subdocument default isn't applied on init.
workerProfileSchema.pre('validate', function () {
  if (this.region == null) this.set('region', {});
});

export const WorkerProfile = model<WorkerProfileDoc>('WorkerProfile', workerProfileSchema);
export type WorkerProfileDocument = HydratedDocument<WorkerProfileDoc>;
