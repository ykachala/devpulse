/**
 * Sync API routes.
 *
 * POST /api/v1/sync        — Trigger a GitHub data sync for the authenticated user
 * GET  /api/v1/sync/status — Get the status of the most recent sync job
 */
import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/auth/middleware';
import { db } from '@/db/client';
import { getIngestionQueue } from '@/ingestion/queue';
import { logger } from '@/logger';

export const syncRouter = Router();

syncRouter.use(authMiddleware);

/**
 * POST /api/v1/sync
 * Creates a SyncJob in the database and enqueues a repo-scan BullMQ job.
 */
syncRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const syncJob = await db.syncJob.create({
      data: { userId, status: 'pending' },
    });

    const queue = getIngestionQueue();
    await queue.add('repo-scan', { userId, jobId: syncJob.id }, { jobId: syncJob.id });

    logger.info({ userId, jobId: syncJob.id }, 'Sync job enqueued');

    res.status(202).json({
      success: true,
      data: { jobId: syncJob.id, status: 'pending' },
      message: 'Sync job queued.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to trigger sync');
    res.status(500).json({ success: false, data: null, message: 'Failed to trigger sync.' });
  }
});

/**
 * GET /api/v1/sync/status
 * Returns the most recent SyncJob for the authenticated user.
 */
syncRouter.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const syncJob = await db.syncJob.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!syncJob) {
      res.status(404).json({ success: false, data: null, message: 'No sync job found.' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: syncJob.id,
        status: syncJob.status,
        progress: syncJob.progress,
        total: syncJob.total,
        error: syncJob.error,
        completedAt: syncJob.completedAt,
      },
      message: 'Sync status retrieved.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get sync status');
    res.status(500).json({ success: false, data: null, message: 'Failed to get sync status.' });
  }
});
