/**
 * Analysis engine — orchestrates all analysis modules for a given user.
 * Loads raw data from the database, runs detectors, and persists results.
 */
import { db } from '@/db/client';
import { detectStacks, RepoData } from '@/analysis/stackDetector';
import { detectPatterns } from '@/analysis/patternTagger';
import { computeSeniority, CommitData } from '@/analysis/seniorityHeuristics';
import { logger } from '@/logger';

/**
 * Computes a consistency score from commit frequency over the last 6 months.
 * A developer who commits every week scores higher than one who binge-commits.
 */
function computeConsistencyScore(commits: CommitData[]): number {
  if (commits.length === 0) return 0;

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);

  const recentCommits = commits.filter((c) => c.authoredAt >= sixMonthsAgo);
  if (recentCommits.length === 0) return 0;

  // Group commits by ISO week
  const weekCounts = new Map<string, number>();
  for (const commit of recentCommits) {
    const week = getIsoWeekKey(commit.authoredAt);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
  }

  const totalWeeks = 26; // 6 months ≈ 26 weeks
  const activeWeeks = weekCounts.size;
  const consistency = activeWeeks / totalWeeks;

  return Math.min(1, consistency);
}

function getIsoWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/**
 * Runs the complete analysis pipeline for a user and persists the result.
 */
export async function runAnalysis(userId: string): Promise<void> {
  logger.info({ userId }, 'Running analysis for user');

  // Load all repos and commits from DB
  const [dbRepos, dbCommits] = await Promise.all([
    db.repo.findMany({ where: { userId } }),
    db.commit.findMany({ where: { userId }, orderBy: { authoredAt: 'desc' } }),
  ]);

  // Map DB records to analysis types
  const repos: RepoData[] = dbRepos.map((r) => ({
    primaryLanguage: r.primaryLanguage,
    languages: r.languages as Record<string, number>,
    topics: r.topics,
    dependencyFiles: r.dependencyFiles as Record<string, boolean>,
    hasCiCd: r.hasCiCd,
    hasDocker: r.hasDocker,
    hasTests: r.hasTests,
  }));

  const commits: CommitData[] = dbCommits.map((c) => ({
    message: c.message,
    authoredAt: c.authoredAt,
  }));

  // Run analysis modules
  const techStacks = detectStacks(repos);
  const architectureTags = detectPatterns(repos);
  const seniority = computeSeniority(repos, commits);
  const consistencyScore = computeConsistencyScore(commits);

  // Persist to DB
  await db.analysis.upsert({
    where: { userId },
    update: {
      techStacks,
      architectureTags,
      seniorityScore: seniority.score,
      consistencyScore,
      commitQuality: seniority.commitQuality,
      testCoverage: seniority.testCoverage,
    },
    create: {
      userId,
      techStacks,
      architectureTags,
      seniorityScore: seniority.score,
      consistencyScore,
      commitQuality: seniority.commitQuality,
      testCoverage: seniority.testCoverage,
    },
  });

  logger.info(
    {
      userId,
      stackCount: techStacks.length,
      tags: architectureTags,
      seniorityScore: seniority.score,
      consistencyScore,
    },
    'Analysis complete'
  );
}
