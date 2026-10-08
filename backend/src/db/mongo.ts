/**
 * Mongo connection. Call connectMongo() at boot (server) or in test setup.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

export async function connectMongo(uri = env.MONGO_URI): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  logger.info({ host: conn.connection.host, db: conn.connection.name }, 'mongo connected');
  ensureIndexes().catch((err) => logger.error({ err }, 'index creation failed'));
  return conn;
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export function mongoUp(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Create the indexes the app depends on (idempotent). */
export async function ensureIndexes(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) return;
  // registered lazily by models via their own syncIndexes in services; this
  // function is kept for app-level compound indexes added later.
}
