/**
 * HTTP server bootstrap. Connects Mongo first (fails fast), then listens.
 */
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';

const app = createApp();

try {
  await connectMongo();
} catch (err) {
  logger.error({ err, uri: env.MONGO_URI }, 'cannot reach MongoDB — is `npm run infra:up` running?');
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close();
  await disconnectMongo();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
