/**
 * BullMQ job processor for the 'repo-scan' job type.
 *
 * Scans all user repositories from GitHub:
 * - Fetches language stats
 * - Detects CI/CD, Docker, and test presence
 * - Detects dependency management files
 * - Upserts repo records in the database
 * - Updates SyncJob progress
 */
import { Job } from 'bullmq';
import { db } from '@/db/client';
import { GitHubClient } from '@/ingestion/githubClient';
import { decryptToken } from '@/auth/crypto';
import { loadConfig } from '@/config';
import { logger } from '@/logger';

const DEPENDENCY_FILES = [
  'package.json',
  'requirements.txt',
  'composer.json',
  'Gemfile',
  'go.mod',
  'pom.xml',
  'Cargo.toml',
];

export interface RepoScanJobData {
  userId: string;
  jobId: string;
}

/**
 * Detects dependency management files in a repository by checking GitHub contents.
 */
async function detectDependencyFiles(
  client: GitHubClient,
  fullName: string
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  await Promise.all(
    DEPENDENCY_FILES.map(async (file) => {
      const { exists } = await client.getRepoContents(fullName, file);
      results[file] = exists;
    })
  );
  return results;
}

/**
 * Main processor for the repo-scan job.
 */
export async function processRepoScan(job: Job<RepoScanJobData>): Promise<void> {
  const { userId, jobId } = job.data;
  const config = loadConfig();

  logger.info({ userId, jobId }, 'Starting repo scan job');

  // Update sync job to running
  await db.syncJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  // Load encrypted GitHub token
  const oauthToken = await db.oAuthToken.findUnique({ where: { userId } });
  if (!oauthToken) {
    await db.syncJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: 'No OAuth token found for user' },
    });
    throw new Error(`No OAuth token found for user ${userId}`);
  }

  const accessToken = decryptToken(
    oauthToken.encryptedToken,
    oauthToken.tokenIv,
    oauthToken.tokenTag,
    config.tokenEncryptionKey
  );

  const client = new GitHubClient(accessToken);
  const repos = await client.getUserRepos();

  // Update total count on sync job
  await db.syncJob.update({
    where: { id: jobId },
    data: { total: repos.length },
  });

  let processed = 0;
  for (const repo of repos) {
    try {
      const [languages, ciCd, docker, tests, depFiles] = await Promise.all([
        client.getRepoLanguages(repo.full_name),
        client.getRepoContents(repo.full_name, '.github/workflows'),
        client.getRepoContents(repo.full_name, 'Dockerfile'),
        client.getRepoContents(repo.full_name, 'test').then(({ exists }) =>
          exists
            ? Promise.resolve({ exists })
            : client.getRepoContents(repo.full_name, '__tests__').then(({ exists: e }) =>
                e ? { exists: true } : client.getRepoContents(repo.full_name, 'spec')
              )
        ),
        detectDependencyFiles(client, repo.full_name),
      ]);

      // Primary language is the one with the most bytes
      const primaryLanguage =
        Object.entries(languages).sort(([, a], [, b]) => b - a)[0]?.[0] ?? repo.language ?? null;

      await db.repo.upsert({
        where: { githubId: repo.id },
        update: {
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          primaryLanguage,
          languages,
          topics: repo.topics ?? [],
          starCount: repo.stargazers_count,
          forkCount: repo.forks_count,
          isPrivate: repo.private,
          hasCiCd: ciCd.exists,
          hasDocker: docker.exists,
          hasTests: tests.exists,
          dependencyFiles: depFiles,
        },
        create: {
          githubId: repo.id,
          userId,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          primaryLanguage,
          languages,
          topics: repo.topics ?? [],
          starCount: repo.stargazers_count,
          forkCount: repo.forks_count,
          isPrivate: repo.private,
          hasCiCd: ciCd.exists,
          hasDocker: docker.exists,
          hasTests: tests.exists,
          dependencyFiles: depFiles,
        },
      });

      processed++;
      await db.syncJob.update({
        where: { id: jobId },
        data: { progress: processed },
      });
    } catch (err) {
      logger.warn({ err, repoFullName: repo.full_name }, 'Failed to process repo, skipping');
    }
  }

  logger.info({ userId, jobId, processed }, 'Repo scan complete, queuing commit history');

  // Queue the commit history job
  const { getIngestionQueue } = require('@/ingestion/queue');
  const queue = getIngestionQueue();
  await queue.add('commit-history', { userId, jobId });
}
