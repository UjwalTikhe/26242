// Offline sync engine. While the device is offline (or a call fails), mutations
// are queued in IndexedDB and flushed when connectivity/auth return. Profile,
// declaration and answers go through /sync/push (the contract's LWW engine);
// assessment-level API calls re-run their own endpoint with Idempotency-Key;
// media uploads replay through tus.
import { SYNC_FLUSH_INTERVAL_MS, SYNC_MAX_ATTEMPTS, APP_VERSION } from '../config';
import type { SyncOpInput } from './client';
import { syncPush } from './client';
import { tusUpload, type TusMeta } from './tus';
import { api } from './api';
import { uuid, nowIso } from './uuid';
import { idb } from './idb';
import { accessToken } from './session';

export type OutboxKind = 'api' | 'sync' | 'upload';

export interface OutboxOp {
  id: string;
  kind: OutboxKind;
  createdAt: string;
  attempts: number;
  lastError?: string;
  // api
  url?: string;
  method?: string;
  body?: unknown;
  // sync entity
  entity?: 'profile' | 'declaration' | 'answers';
  action?: 'create' | 'update';
  version?: number;
  payload?: unknown;
  // upload
  file?: { name: string; type: string; meta: TusMeta };
  fileBlob?: Blob;
}

const MAX = 32; // hard cap on queued upload blobs (stay off the device quota)

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export async function enqueue(op: Omit<OutboxOp, 'id' | 'createdAt' | 'attempts'>): Promise<void> {
  const entry: OutboxOp = { ...op, id: uuid(), createdAt: nowIso(), attempts: 0 };
  if (entry.kind === 'upload') {
    const ups = (await idb.outbox.keys()).filter((k) => k.startsWith('upload:'));
    if (ups.length >= MAX) throw new Error('Too many offline uploads queued — go online to sync first.');
  }
  await idb.outbox.set(entry.id, entry);
}

export async function outboxCount(): Promise<number> {
  return (await idb.outbox.keys()).length;
}

export async function clearOutbox(): Promise<void> {
  for (const k of await idb.outbox.keys()) await idb.outbox.remove(k);
}

export function watchOnline(cb: (online: boolean) => void): () => void {
  const up = () => cb(true);
  const down = () => cb(false);
  window.addEventListener('online', up);
  window.addEventListener('offline', down);
  return () => {
    window.removeEventListener('online', up);
    window.removeEventListener('offline', down);
  };
}

/** One pass over the outbox. Resolves true when nothing is left to do. */
export async function flushOutbox(): Promise<{ flushed: number; remaining: number }> {
  if (!isOnline() || !accessToken()) return { flushed: 0, remaining: await outboxCount() };
  const entries = (await idb.outbox.getAll<OutboxOp>()).sort((a, b) => a.value.createdAt.localeCompare(b.value.createdAt));
  let flushed = 0;
  for (const { key, value } of entries) {
    if (value.attempts >= SYNC_MAX_ATTEMPTS) {
      await idb.outbox.remove(key);
      continue;
    }
    try {
      await replayOp(value);
      await idb.outbox.remove(key);
      flushed++;
    } catch (err) {
      if (err instanceof Error && /offline|network|failed to fetch|ECONN|abort/i.test(err.message)) {
        break; // keep queued, retry on next tick/interval
      }
      // Permanent-ish failure (4xx): bump attempts, surface to UI, keep for review.
      value.attempts += 1;
      value.lastError = err instanceof Error ? err.message : String(err);
      await idb.outbox.set(key, value);
    }
  }
  return { flushed, remaining: await outboxCount() };
}

async function replayOp(op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'sync': {
      const input: SyncOpInput = {
        opId: op.id,
        idempotencyKey: op.id,
        entity: op.entity!,
        action: op.action!,
        clientUpdatedAt: op.createdAt,
        version: op.version,
        payload: op.payload,
      };
      const res = await syncPush([input]);
      const r = res.results[0];
      if (r?.status === 'rejected') throw new Error(`sync rejected: ${r.message ?? 'unknown'}`);
      if (r?.status === 'conflict') throw new Error(`sync conflict: ${r.message ?? 'version conflict'}`);
      return;
    }
    case 'api': {
      await api(op.url!, {
        method: (op.method as 'POST' | 'PATCH' | 'PUT' | 'DELETE') ?? 'POST',
        body: op.body,
        raw: true,
        headers: { 'Idempotency-Key': op.id },
      });
      return;
    }
    case 'upload': {
      if (!op.fileBlob || !op.file) throw new Error('upload op missing blob');
      await tusUpload(op.fileBlob, op.file.meta);
      return;
    }
  }
}

/** Convenience: run online-first or fall back to the outbox on network failure. */
export async function onlineOrQueue<T>(
  run: () => Promise<T>,
  queue: () => Promise<void>,
): Promise<{ applied: boolean; result?: T }> {
  if (!isOnline()) {
    await queue();
    return { applied: false };
  }
  try {
    return { applied: true, result: await run() };
  } catch (err) {
    if (err instanceof Error && /fetch|network|offline|load failed|abort/i.test(err.message)) {
      await queue();
      return { applied: false };
    }
    throw err;
  }
}

// Auto-flush: on app start, on becoming online, and on an interval.
let started = false;
export function startSyncLoop(): void {
  if (started) return;
  started = true;
  watchOnline((on) => {
    if (on) void flushOutbox();
  });
  window.setInterval(() => void flushOutbox(), SYNC_FLUSH_INTERVAL_MS);
}

export { APP_VERSION as clientVersion };