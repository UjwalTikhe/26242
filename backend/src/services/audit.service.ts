/**
 * Audit service — writes the per-assessment tamper-evident hash chain and
 * verifies it.
 *
 * Design mirrors the evidence chain: an in-process per-scope mutex prevents a
 * fork, and a best-effort write policy keeps a failed audit entry from failing
 * the business operation (logged at error level). Verification recomputes every
 * hash so tampering is detectable.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { AuditLogEntry, PageQuery } from '@sih/contracts';
import { logger } from '../logger.js';
import { AuditLog } from '../models/audit.models.js';
import { toApi } from '../utils/toApi.js';

const GENESIS = '0'.repeat(64);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/* ------------------------------------------------------------------ */
/* Per-scope append lock (chain must not fork within a process)        */
/* ------------------------------------------------------------------ */

const scopeLocks = new Map<string, Promise<unknown>>();

function withScopeLock<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  const prev = scopeLocks.get(scope) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  scopeLocks.set(
    scope,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

/** Deterministic (key-sorted) JSON so the hash is reproducible. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

function hashPayload(entry: {
  seq: number;
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  actorRole?: string | null;
  data?: Record<string, unknown> | null;
  at: Date;
}): string {
  return sha256(
    canonical({
      seq: entry.seq,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      actorId: entry.actorId ?? null,
      actorRole: entry.actorRole ?? null,
      data: entry.data ?? null,
      at: entry.at.toISOString(),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

export interface AuditInput {
  /** Assessment id. */
  scope: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  actorRole?: string;
  data?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await withScopeLock(input.scope, async () => {
      const last = await AuditLog.findOne({ scope: input.scope }).sort({ seq: -1 }).lean();
      const seq = (last?.seq ?? 0) + 1;
      const prevHash = last?.hash ?? GENESIS;
      const at = new Date();
      // Drop undefined keys: Mongoose would strip them on write, so hashing
      // them here (as null) would desync hash vs. stored payload.
      const data = input.data
        ? Object.fromEntries(Object.entries(input.data).filter(([, v]) => v !== undefined))
        : undefined;
      const payloadHash = hashPayload({
        seq,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        actorRole: input.actorRole,
        data,
        at,
      });
      const hash = sha256(`${prevHash}:${payloadHash}`);
      await AuditLog.create({
        _id: randomUUID(),
        scope: input.scope,
        seq,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorId: input.actorId,
        actorRole: input.actorRole,
        data,
        prevHash,
        payloadHash,
        hash,
        at,
      });
    });
  } catch (err) {
    logger.error(
      { err, scope: input.scope, action: input.action },
      'audit-log write failed (business op unaffected)',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Read + verify                                                       */
/* ------------------------------------------------------------------ */

export async function listAudit(
  scope: string,
  query: z.infer<typeof PageQuery>,
): Promise<{ items: AuditLogEntry[]; page: number; limit: number; total: number }> {
  const [entries, total] = await Promise.all([
    AuditLog.find({ scope })
      .sort({ seq: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    AuditLog.countDocuments({ scope }),
  ]);
  return { items: entries.map((e) => toApi(e)), page: query.page, limit: query.limit, total };
}

export interface ChainVerification {
  valid: boolean;
  entries: number;
  /** First seq whose link/hash does not match, when invalid. */
  brokenAt?: number;
}

export async function verifyAuditChain(scope: string): Promise<ChainVerification> {
  const entries = await AuditLog.find({ scope }).sort({ seq: 1 }).lean();
  let prev = GENESIS;
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    if (e.seq !== i + 1) return { valid: false, entries: entries.length, brokenAt: e.seq };
    if (e.prevHash !== prev) return { valid: false, entries: entries.length, brokenAt: e.seq };
    const payloadHash = hashPayload({
      seq: e.seq,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      actorId: e.actorId ?? null,
      actorRole: e.actorRole ?? null,
      data: e.data ?? null,
      at: e.at,
    });
    if (payloadHash !== e.payloadHash) return { valid: false, entries: entries.length, brokenAt: e.seq };
    if (sha256(`${e.prevHash}:${payloadHash}`) !== e.hash) {
      return { valid: false, entries: entries.length, brokenAt: e.seq };
    }
    prev = e.hash;
  }
  return { valid: true, entries: entries.length };
}
