/**
 * Profile upload utility.
 * Handles uploading generated README and profile JSON to S3
 * and persisting the S3 keys back to the database.
 */
import { db } from '@/db/client';
import { S3Storage, S3Config } from '@/storage/s3Client';
import { logger } from '@/logger';

export interface ProfileUploadResult {
  readmeKey: string;
  profileKey: string;
}

/**
 * Uploads the user's generated README and full profile JSON to S3.
 * Returns the S3 keys for both objects and updates the Profile record.
 *
 * @param userId - The internal user UUID
 * @param readmeMarkdown - Markdown content for the README
 * @param profileJson - Full profile JSON string
 * @param s3Config - AWS S3 configuration
 */
export async function uploadProfileToS3(
  userId: string,
  readmeMarkdown: string,
  profileJson: string,
  s3Config: S3Config
): Promise<ProfileUploadResult> {
  const storage = new S3Storage(s3Config);

  const readmeKey = `profiles/${userId}/readme.md`;
  const profileKey = `profiles/${userId}/profile.json`;

  await Promise.all([
    storage.upload(readmeKey, readmeMarkdown, 'text/markdown'),
    storage.upload(profileKey, profileJson, 'application/json'),
  ]);

  logger.info({ userId, readmeKey, profileKey }, 'Profile assets uploaded to S3');

  // Persist the S3 keys to the database
  await db.profile.update({
    where: { userId },
    data: { s3ReadmeKey: readmeKey, s3ProfileKey: profileKey },
  });

  return { readmeKey, profileKey };
}
