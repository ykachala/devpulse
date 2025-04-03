/**
 * User repository — all database operations scoped to the User model.
 * Business logic lives in services; this layer owns only raw data access.
 */
import { User } from '@prisma/client';
import { db } from '@/db/client';

/**
 * Finds a user by their GitHub numeric ID.
 */
export async function findByGithubId(githubId: number): Promise<User | null> {
  return db.user.findUnique({ where: { githubId } });
}

/**
 * Finds a user by their internal UUID.
 */
export async function findById(id: string): Promise<User | null> {
  return db.user.findUnique({ where: { id } });
}

export interface UpsertUserData {
  githubId: number;
  login: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}

/**
 * Creates or updates a user record from GitHub OAuth data.
 * Uses githubId as the upsert key.
 */
export async function upsert(data: UpsertUserData): Promise<User> {
  return db.user.upsert({
    where: { githubId: data.githubId },
    update: {
      login: data.login,
      email: data.email ?? null,
      name: data.name ?? null,
      avatarUrl: data.avatarUrl ?? null,
    },
    create: {
      githubId: data.githubId,
      login: data.login,
      email: data.email ?? null,
      name: data.name ?? null,
      avatarUrl: data.avatarUrl ?? null,
    },
  });
}

/**
 * Stamps the user's lastSyncedAt to now, used for incremental sync delta tracking.
 */
export async function updateLastSynced(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { lastSyncedAt: new Date() },
  });
}
