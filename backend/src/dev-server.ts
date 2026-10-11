import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { connectMongo, disconnectMongo } from './db/mongo.js';
import { initRealtime } from './realtime/index.js';

async function start() {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const app = createApp();
  const httpServer = createServer(app);
  await connectMongo(uri);
  initRealtime(httpServer);
  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, uri }, 'API listening (in-mem mongo)');
  });
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    httpServer.close();
    await disconnectMongo();
    await mongod.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
