/**
 * Test database: one mongodb-memory-server per test file.
 * Files run sequentially (vitest fileParallelism: false), so each file gets
 * its own isolated mongod and no ports collide.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

export async function startDb(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('sih_test'), { serverSelectionTimeoutMS: 8000 });
}

export async function stopDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
}

/** Wipe all collections between tests. */
export async function clearDb(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}
