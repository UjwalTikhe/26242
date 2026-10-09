/**
 * AI analysis worker process (`npm run dev:worker` / `start:worker`).
 *
 * Only useful with the bullmq driver: it consumes the `sih-analysis` queue.
 * With the inline driver the API process runs the pipeline itself, so this
 * process exits with a clear warning instead of idling.
 */
import { connectMongo, disconnectMongo } from '../db/mongo.js';
import { effectiveQueueDriver } from '../config/env.js';
import { logger } from '../logger.js';
import { createAnalysisWorker } from '../queue/analysis.queue.js';

await connectMongo();

if (effectiveQueueDriver !== 'bullmq') {
  logger.warn(
    { driver: effectiveQueueDriver },
    'analysis worker started with the inline queue — nothing to consume; set REDIS_URL + QUEUE_DRIVER=bullmq',
  );
  await disconnectMongo();
  process.exit(0);
}

const worker = await createAnalysisWorker();
logger.info('analysis worker listening on the sih-analysis queue');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  await disconnectMongo();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
