/**
 * HTTP server bootstrap. Connects Mongo first (fails fast), then listens and
 * attaches the Socket.IO real-time channel to the same HTTP server.
 */
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { initRealtime } from './realtime/index.js';

const app = createApp();
const httpServer = createServer(app);

try {
  await connectMongo();
} catch (err) {
  logger.error({ err, uri: env.MONGO_URI }, 'cannot reach MongoDB — is `npm run infra:up` running?');
  process.exit(1);
}

initRealtime(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  httpServer.close();
  await disconnectMongo();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
