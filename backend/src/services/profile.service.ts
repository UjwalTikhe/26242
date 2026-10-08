/**
 * Worker profile service — last-write-wins with a version field.
 *
 * Rules (our offline-sync agreement):
 *  - client sends { version, clientUpdatedAt, patch }
 *  - if client version < server version → conflict (server wins: newer writes exist)
 *  - otherwise apply patch, bump version, return the stored profile
 */
import type { z } from 'zod';
import type { UpdateProfileReq } from '@sih/contracts';
import type { LanguageCode } from '@sih/contracts';
import { notFound } from '../errors.js';
import { WorkerProfile, type WorkerProfileDoc } from '../models/profile.models.js';
import { toApi } from '../utils/toApi.js';
import { recordChange } from './changelog.service.js';

export type ProfileResult =
  | { ok: true; profile: unknown }
  | { ok: false; server: unknown; message: string };

export async function getProfileByUser(userId: string): Promise<unknown> {
  const doc = await WorkerProfile.findOne({ userId }).lean();
  if (!doc) throw notFound('Profile not found');
  return toApi(doc);
}

export async function updateProfile(userId: string, input: z.infer<typeof UpdateProfileReq>): Promise<ProfileResult> {
  const current = await WorkerProfile.findOne({ userId }).lean();
  if (!current) throw notFound('Profile not found');

  if (input.version < current.version) {
    return {
      ok: false,
      server: toApi(current),
      message: 'A newer version of this profile exists on the server',
    };
  }

  const patch = { ...input.patch } as Partial<WorkerProfileDoc>;
  const updated = await WorkerProfile.findOneAndUpdate(
    { _id: current._id, version: { $gte: current.version } },
    {
      $set: {
        ...patch,
        version: current.version + 1,
        clientUpdatedAt: new Date(input.clientUpdatedAt),
      },
    },
    { returnDocument: 'after' as const },
  ).lean();

  if (!updated) {
    // lost a race with a concurrent write — re-read and report conflict
    const latest = await WorkerProfile.findOne({ userId }).lean();
    return {
      ok: false,
      server: toApi(latest),
      message: 'Concurrent update detected, please resync',
    };
  }
  const api = toApi(updated);
  await recordChange({
    entity: 'profile',
    id: String(updated._id),
    ownerId: userId,
    version: updated.version,
    updatedAt: updated.updatedAt,
    data: api,
  });
  return { ok: true, profile: api };
}

/** Bootstrap a profile if the user somehow lacks one (defensive). */
export async function ensureProfile(user: {
  _id: string;
  phone?: string;
  displayName?: string;
  language?: LanguageCode;
}): Promise<void> {
  const existing = await WorkerProfile.findOne({ userId: user._id }).lean();
  if (existing) return;
  const created = await WorkerProfile.create({
    _id: crypto.randomUUID(),
    userId: user._id,
    phone: user.phone,
    fullName: user.displayName ?? user.phone ?? 'Worker',
    language: user.language ?? 'en',
    version: 0,
  });
  // offline clients must be able to pull their bootstrapped profile
  await recordChange({
    entity: 'profile',
    id: String(created._id),
    ownerId: user._id,
    version: 0,
    updatedAt: created.createdAt,
    data: created.toObject(),
  });
}
