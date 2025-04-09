/**
 * SyncJob repository — all queries are explicitly scoped to a userId
 * to enforce strict per-user data isolation.
 *
 * Data Isolation Contract:
 * - Every query includes `userId` in the WHERE clause
 * - No cross-user data can be returned from these functions
 * - Controllers must pass req.user.sub (never a user-supplied ID) as userId
 */
import { SyncJob } from '@prisma/client';
import { db } from '@/db/client';

/**
 * Finds the most recent SyncJob for the given user.
 * Scoped by userId — cannot return another user's jobs.
 */
export async function findLatestSyncJob(userId: string): Promise<SyncJob | null> {
  return db.syncJob.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Finds a specific SyncJob by ID, scoped to the user.
 * Returns null if the job exists but belongs to a different user (isolation enforced).
 */
export async function findSyncJobById(jobId: string, userId: string): Promise<SyncJob | null> {
  return db.syncJob.findFirst({
    where: { id: jobId, userId },
  });
}

/**
 * Creates a new SyncJob for the user.
 */
export async function createSyncJob(userId: string): Promise<SyncJob> {
  return db.syncJob.create({
    data: { userId, status: 'pending' },
  });
}
