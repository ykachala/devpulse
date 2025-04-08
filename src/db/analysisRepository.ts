/**
 * Analysis repository — database operations for the Analysis model.
 */
import { Analysis } from '@prisma/client';
import { db } from '@/db/client';

/**
 * Finds an Analysis record by user ID.
 */
export async function findAnalysisByUserId(userId: string): Promise<Analysis | null> {
  return db.analysis.findUnique({ where: { userId } });
}

export interface UpsertAnalysisData {
  userId: string;
  techStacks: unknown;
  architectureTags: string[];
  seniorityScore: number;
  consistencyScore: number;
  commitQuality: number;
  testCoverage: number;
}

/**
 * Creates or updates an Analysis record.
 */
export async function upsertAnalysis(data: UpsertAnalysisData): Promise<Analysis> {
  return db.analysis.upsert({
    where: { userId: data.userId },
    update: {
      techStacks: data.techStacks,
      architectureTags: data.architectureTags,
      seniorityScore: data.seniorityScore,
      consistencyScore: data.consistencyScore,
      commitQuality: data.commitQuality,
      testCoverage: data.testCoverage,
    },
    create: {
      userId: data.userId,
      techStacks: data.techStacks,
      architectureTags: data.architectureTags,
      seniorityScore: data.seniorityScore,
      consistencyScore: data.consistencyScore,
      commitQuality: data.commitQuality,
      testCoverage: data.testCoverage,
    },
  });
}
