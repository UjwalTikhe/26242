/**
 * Local-disk storage driver (dev / single-instance / test).
 * All paths resolve under a configured root; keys outside the root are 400.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { badRequest, notFound } from '../errors.js';
import { assertSafeStorageKey, type StorageDriver, type StoragePutResult, type StorageStat } from './driver.js';

export class LocalDiskStorage implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Safe absolute path for a key — must stay inside the root. */
  private resolveKey(key: string): string {
    assertSafeStorageKey(key);
    const abs = path.resolve(this.root, key);
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw badRequest('invalid_storage_key', 'storage key escapes the storage root');
    }
    return abs;
  }

  async put(key: string, data: Buffer | Readable): Promise<StoragePutResult> {
    const abs = this.resolveKey(key);
    await mkdir(path.dirname(abs), { recursive: true });
    if (Buffer.isBuffer(data)) {
      await writeFile(abs, data);
      return { sizeBytes: data.byteLength };
    }
    let sizeBytes = 0;
    const counter = new Transform({
      transform(chunk, _enc, cb) {
        sizeBytes += (chunk as Buffer).length;
        cb(null, chunk);
      },
    });
    await pipeline(data, counter, createWriteStream(abs));
    return { sizeBytes };
  }

  async getStream(key: string): Promise<Readable> {
    const abs = this.resolveKey(key);
    await this.assertExists(abs);
    return createReadStream(abs);
  }

  async stat(key: string): Promise<StorageStat> {
    const abs = this.resolveKey(key);
    try {
      const st = await stat(abs);
      if (!st.isFile()) throw notFound('Storage object not found');
      return { sizeBytes: st.size };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('Storage object not found');
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const abs = this.resolveKey(key);
    try {
      const st = await stat(abs);
      return st.isFile();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw err;
    }
  }

  async sha256(key: string): Promise<string> {
    const abs = this.resolveKey(key);
    await this.assertExists(abs);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(abs)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  async remove(key: string): Promise<void> {
    const abs = this.resolveKey(key);
    await rm(abs, { force: true });
  }

  private async assertExists(abs: string): Promise<void> {
    try {
      const st = await stat(abs);
      if (!st.isFile()) throw notFound('Storage object not found');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('Storage object not found');
      throw err;
    }
  }
}
