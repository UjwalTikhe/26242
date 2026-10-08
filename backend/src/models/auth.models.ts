/**
 * Auth-related models: User, OtpCode, RefreshToken.
 * Field names mirror @sih/contracts entities; extra server-only fields are
 * marked select:false or documented.
 */
import { randomUUID } from 'node:crypto';
import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { ROLES, type Role } from '@sih/contracts';

export interface UserDoc {
  _id: string;
  role: Role;
  phone?: string;
  email?: string;
  displayName?: string;
  language: string;
  active: boolean;
  passwordHash?: string; // assessors only, select:false
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    phone: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    displayName: { type: String },
    language: { type: String, default: 'en' },
    active: { type: Boolean, default: true },
    passwordHash: { type: String, select: false },
  },
  { timestamps: true, versionKey: false },
);
export const User = model<UserDoc>('User', userSchema);
export type UserDocument = HydratedDocument<UserDoc>;

/* ------------------------------------------------------------------ */

export interface OtpCodeDoc {
  _id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt?: Date;
  createdAt: Date;
}

const otpSchema = new Schema<OtpCodeDoc>(
  {
    _id: { type: String, required: true },
    phone: { type: String, required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
otpSchema.index({ phone: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup

export const OtpCode = model<OtpCodeDoc>('OtpCode', otpSchema);

/* ------------------------------------------------------------------ */

export interface RefreshTokenDoc {
  _id: string; // jti
  userId: string;
  revokedAt?: Date;
  replacedBy?: string;
  userAgent?: string;
  expiresAt: Date;
  createdAt: Date;
}

const refreshSchema = new Schema<RefreshTokenDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    revokedAt: { type: Date },
    replacedBy: { type: String },
    userAgent: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);
refreshSchema.index({ userId: 1, revokedAt: 1 });
refreshSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<RefreshTokenDoc>('RefreshToken', refreshSchema);

export const newId = () => randomUUID();
