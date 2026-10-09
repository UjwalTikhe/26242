/**
 * Storage driver seam: LocalDisk now, S3/R2 later (STORAGE_DRIVER=s3).
 * Keys are forward-slash relative paths under a single root — e.g. the tus
 * evidence path `tus/<uploadId>`.
 */
import type { Readable } from 'node:stream';
import { badRequest } from '../errors.js';

export interface StoragePutResult {
  sizeBytes: number;
}

export interface StorageStat {
  sizeBytes: number;
}

export interface StorageDriver {
  put(key: string, data: Buffer | Readable): Promise<StoragePutResult>;
  getStream(key: string): Promise<Readable>;
  stat(key: string): Promise<StorageStat>;
  exists(key: string): Promise<boolean>;
  /** Streaming SHA-256 of stored bytes (hex). Throws 404 when missing. */
  sha256(key: string): Promise<string>;
  remove(key: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

/**
 * Reject traversal / absolute / weird keys before touching the filesystem.
 * Throws 400 (AppError) so API callers get a proper 422/400, never a 500.
 */
export function assertSafeStorageKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
    throw badRequest('invalid_storage_key', 'storage key must be a non-empty string ≤ 512 chars');
  }
  if (key.includes('\\') || key.startsWith('/') || key.includes('//')) {
    throw badRequest('invalid_storage_key', 'storage key must be a relative forward-slash path');
  }
  if (!SAFE_KEY.test(key) || key.split('/').some((seg) => seg === '.' || seg === '..')) {
    throw badRequest('invalid_storage_key', 'storage key contains illegal characters or segments');
  }
}
