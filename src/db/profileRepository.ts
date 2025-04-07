/**
 * Profile repository — database operations scoped to the Profile model.
 */
import { Profile } from '@prisma/client';
import { db } from '@/db/client';

export interface UpsertProfileData {
  userId: string;
  bio?: string | null;
  techSummary?: string | null;
  strengthAreas?: string[];
  readmeMarkdown?: string | null;
  s3ReadmeKey?: string | null;
  s3ProfileKey?: string | null;
  generatedAt?: Date | null;
}

/**
 * Creates or updates a Profile record for the given user.
 */
export async function upsertProfile(data: UpsertProfileData): Promise<Profile> {
  return db.profile.upsert({
    where: { userId: data.userId },
    update: {
      bio: data.bio ?? undefined,
      techSummary: data.techSummary ?? undefined,
      strengthAreas: data.strengthAreas ?? undefined,
      readmeMarkdown: data.readmeMarkdown ?? undefined,
      s3ReadmeKey: data.s3ReadmeKey ?? undefined,
      s3ProfileKey: data.s3ProfileKey ?? undefined,
      generatedAt: data.generatedAt ?? undefined,
    },
    create: {
      userId: data.userId,
      bio: data.bio ?? null,
      techSummary: data.techSummary ?? null,
      strengthAreas: data.strengthAreas ?? [],
      readmeMarkdown: data.readmeMarkdown ?? null,
      s3ReadmeKey: data.s3ReadmeKey ?? null,
      s3ProfileKey: data.s3ProfileKey ?? null,
      generatedAt: data.generatedAt ?? null,
    },
  });
}

/**
 * Finds a Profile by user ID.
 */
export async function findProfileByUserId(userId: string): Promise<Profile | null> {
  return db.profile.findUnique({ where: { userId } });
}
