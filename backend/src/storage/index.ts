/**
 * Storage factory — one driver per process (env-driven).
 * s3 driver is a planned Phase; fail loud if selected before it exists.
 */
import { env } from '../config/env.js';
import { LocalDiskStorage } from './local.js';
import type { StorageDriver } from './driver.js';

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (!driver) {
    if (env.STORAGE_DRIVER === 's3') {
      throw new Error('S3 storage driver is not implemented yet — set STORAGE_DRIVER=local');
    }
    driver = new LocalDiskStorage(env.LOCAL_STORAGE_DIR);
  }
  return driver;
}

/** Test hook: drop the cached driver (e.g. after wiping the storage dir). */
export function resetStorage(): void {
  driver = undefined;
}
