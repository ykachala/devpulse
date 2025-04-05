/**
 * BullMQ job processor for the 'commit-history' job type.
 *
 * For each user repository, fetches commits since the last sync timestamp
 * (full fetch on first sync), upserts commit records, and on completion
 * triggers the analysis engine.
 */
import { Job } from 'bullmq';
import { db } from '@/db/client';
import { GitHubClient } from '@/ingestion/githubClient';
import { decryptToken } from '@/auth/crypto';
import { loadConfig } from '@/config';
import { logger } from '@/logger';
import { updateLastSynced } from '@/db/userRepository';
import { runAnalysis } from '@/analysis/engine';

export interface CommitHistoryJobData {
  userId: string;
  jobId: string;
}

/**
 * Main processor for the commit-history job.
 */
export async function processCommitHistory(job: Job<CommitHistoryJobData>): Promise<void> {
  const { userId, jobId } = job.data;
  const config = loadConfig();

  logger.info({ userId, jobId }, 'Starting commit history ingestion');

  // Load user and their OAuth token
  const [user, oauthToken] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.oAuthToken.findUnique({ where: { userId } }),
  ]);

  if (!user || !oauthToken) {
    await db.syncJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: 'User or OAuth token not found' },
    });
    throw new Error(`User or OAuth token not found for ${userId}`);
  }

  const accessToken = decryptToken(
    oauthToken.encryptedToken,
    oauthToken.tokenIv,
    oauthToken.tokenTag,
    config.tokenEncryptionKey
  );

  const client = new GitHubClient(accessToken);

  // Incremental sync: only fetch commits since last sync
  const since = user.lastSyncedAt?.toISOString();

  // Load all repos for this user
  const repos = await db.repo.findMany({ where: { userId } });

  let totalCommits = 0;
  for (const repo of repos) {
    try {
      const commits = await client.getCommits(repo.fullName, since);

      for (const commit of commits) {
        try {
          await db.commit.upsert({
            where: { sha: commit.sha },
            update: {
              message: commit.commit.message,
              authoredAt: new Date(commit.commit.author.date),
            },
            create: {
              sha: commit.sha,
              repoId: repo.id,
              userId,
              message: commit.commit.message,
              authoredAt: new Date(commit.commit.author.date),
            },
          });
          totalCommits++;
        } catch (err) {
          logger.warn({ err, sha: commit.sha }, 'Failed to upsert commit, skipping');
        }
      }

      // Update repo commit count and last commit timestamp
      if (commits.length > 0) {
        const latestCommitDate = commits
          .map((c) => new Date(c.commit.author.date))
          .sort((a, b) => b.getTime() - a.getTime())[0];

        await db.repo.update({
          where: { id: repo.id },
          data: {
            commitCount: { increment: commits.length },
            lastCommitAt: latestCommitDate,
          },
        });
      }
    } catch (err) {
      logger.warn({ err, repoId: repo.id, fullName: repo.fullName }, 'Failed to fetch commits for repo');
    }
  }

  // Stamp last synced at before running analysis
  await updateLastSynced(userId);

  // Mark sync job as completed
  await db.syncJob.update({
    where: { id: jobId },
    data: { status: 'completed', completedAt: new Date() },
  });

  logger.info({ userId, jobId, totalCommits }, 'Commit history ingestion complete, running analysis');

  // Trigger analysis asynchronously — errors here don't fail the sync job
  try {
    await runAnalysis(userId);
  } catch (err) {
    logger.error({ err, userId }, 'Analysis failed after commit ingestion');
  }
}
