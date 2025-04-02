/**
 * BullMQ ingestion queue — manages the devpulse:ingestion queue lifecycle.
 */
import { Queue, Worker, Job } from 'bullmq';
import { getRedis } from '@/redis/client';
import { logger } from '@/logger';

const QUEUE_NAME = 'devpulse:ingestion';

let queueInstance: Queue | null = null;

/**
 * Returns the BullMQ Queue singleton for ingestion jobs.
 * @param redisUrl - Redis URL (required on first call)
 */
export function getIngestionQueue(redisUrl?: string): Queue {
  if (!queueInstance) {
    const connection = getRedis(redisUrl);
    queueInstance = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    });
    logger.info({ queue: QUEUE_NAME }, 'BullMQ queue created');
  }
  return queueInstance;
}

/**
 * Closes the ingestion queue gracefully.
 */
export async function closeIngestionQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
    logger.info({ queue: QUEUE_NAME }, 'BullMQ queue closed');
  }
}

/**
 * Creates and starts the BullMQ worker for the ingestion queue.
 * Concurrency is set to 3 to handle multiple users simultaneously while
 * respecting GitHub's per-token rate limits.
 */
export function createIngestionWorker(): Worker {
  const { processRepoScan } = require('@/ingestion/repoScanJob');
  const { processCommitHistory } = require('@/ingestion/commitHistoryJob');

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === 'repo-scan') return processRepoScan(job);
      if (job.name === 'commit-history') return processCommitHistory(job);
      throw new Error(`Unknown job type: ${job.name}`);
    },
    { connection: getRedis(), concurrency: 3 }
  );

  worker.on('completed', (job: Job) => {
    logger.info({ jobId: job.id, jobName: job.name }, 'Job completed');
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Job failed');
  });

  return worker;
}
