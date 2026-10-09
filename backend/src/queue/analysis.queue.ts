/**
 * Analysis job queue seam.
 *
 * - inline: run the pipeline in-process (dev / tests / single node). Errors are
 *   logged, never propagated to the already-committed submit response.
 * - bullmq: hand off to Redis so the API stays responsive and the separate
 *   worker process (src/worker/main.ts) does the heavy media work.
 */
import { effectiveQueueDriver, env } from '../config/env.js';
import { logger } from '../logger.js';
import { analyzeAssessment } from '../services/analysis.service.js';

export const ANALYSIS_QUEUE = 'sih-analysis';

export interface EnqueueResult {
  driver: 'inline' | 'bullmq';
  jobId?: string;
}

export async function enqueueAnalysis(assessmentId: string): Promise<EnqueueResult> {
  if (effectiveQueueDriver === 'inline') {
    try {
      await analyzeAssessment(assessmentId);
    } catch (err) {
      // submit already succeeded; the job record holds the error for the client
      logger.error({ err, assessmentId }, 'inline analysis failed');
    }
    return { driver: 'inline' };
  }

  const { Queue } = await import('bullmq');
  const queue = new Queue(ANALYSIS_QUEUE, { connection: { url: env.REDIS_URL } });
  try {
    const job = await queue.add(
      'analyze',
      { assessmentId },
      {
        jobId: assessmentId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
    return { driver: 'bullmq', jobId: String(job.id) };
  } finally {
    await queue.close().catch(() => undefined);
  }
}

/** Worker factory for src/worker/main.ts (bullmq driver only). */
export async function createAnalysisWorker(): Promise<import('bullmq').Worker> {
  const { Worker } = await import('bullmq');
  const worker = new Worker(
    ANALYSIS_QUEUE,
    async (job) => {
      const { assessmentId } = job.data as { assessmentId: string };
      await analyzeAssessment(assessmentId);
    },
    { connection: { url: env.REDIS_URL }, concurrency: 2 },
  );
  worker.on('failed', (job, err) => logger.error({ err, jobId: job?.id }, 'analysis job failed'));
  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'analysis job completed'));
  return worker;
}
