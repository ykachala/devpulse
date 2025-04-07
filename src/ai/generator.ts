/**
 * AI profile generator.
 * Loads user analysis from DB, builds the prompt, calls Claude,
 * and either streams the response (SSE) or saves the complete result.
 */
import { Response } from 'express';
import { db } from '@/db/client';
import { ClaudeClient } from '@/ai/claudeClient';
import { buildProfilePrompt, AnalysisContext } from '@/ai/promptTemplates';
import { loadConfig } from '@/config';
import { logger } from '@/logger';

interface GeneratedProfile {
  bio: string;
  techSummary: string;
  strengthAreas: string[];
  readmeMarkdown: string;
}

/**
 * Parses a Claude JSON response into a GeneratedProfile.
 * Handles cases where the model wraps the JSON in markdown code fences.
 */
function parseProfileResponse(raw: string): GeneratedProfile {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned) as GeneratedProfile;
  if (!parsed.bio || !parsed.techSummary || !parsed.strengthAreas || !parsed.readmeMarkdown) {
    throw new Error('Claude response missing required profile fields');
  }
  return parsed;
}

/**
 * Builds the AnalysisContext for a user from the database.
 */
async function buildContext(userId: string): Promise<AnalysisContext | null> {
  const [user, analysis, repos] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.analysis.findUnique({ where: { userId } }),
    db.repo.findMany({ where: { userId } }),
  ]);

  if (!user || !analysis) return null;

  // Aggregate top languages from repo data
  const langBytes: Record<string, number> = {};
  for (const repo of repos) {
    const langs = repo.languages as Record<string, number>;
    for (const [lang, bytes] of Object.entries(langs)) {
      langBytes[lang] = (langBytes[lang] ?? 0) + bytes;
    }
  }
  const topLanguages = Object.entries(langBytes)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([lang]) => lang);

  return {
    login: user.login,
    name: user.name,
    techStacks: analysis.techStacks as AnalysisContext['techStacks'],
    architectureTags: analysis.architectureTags,
    seniorityScore: analysis.seniorityScore,
    consistencyScore: analysis.consistencyScore,
    commitQuality: analysis.commitQuality,
    repoCount: repos.length,
    topLanguages,
  };
}

/**
 * Persists the generated profile to the database.
 */
async function saveProfile(userId: string, profile: GeneratedProfile): Promise<void> {
  await db.profile.upsert({
    where: { userId },
    update: {
      bio: profile.bio,
      techSummary: profile.techSummary,
      strengthAreas: profile.strengthAreas,
      readmeMarkdown: profile.readmeMarkdown,
      generatedAt: new Date(),
    },
    create: {
      userId,
      bio: profile.bio,
      techSummary: profile.techSummary,
      strengthAreas: profile.strengthAreas,
      readmeMarkdown: profile.readmeMarkdown,
      generatedAt: new Date(),
    },
  });
}

/**
 * Streams AI profile generation via SSE.
 * Accumulates tokens, saves the complete profile on finish,
 * then uploads to S3.
 */
export async function generateProfileStream(userId: string, res: Response): Promise<void> {
  const config = loadConfig();
  const claude = new ClaudeClient(config.anthropic.apiKey);

  const context = await buildContext(userId);
  if (!context) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'No analysis data found.' })}\n\n`);
    res.end();
    return;
  }

  const prompt = buildProfilePrompt(context);
  let accumulated = '';

  for await (const token of claude.stream(prompt)) {
    accumulated += token;
    res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
  }

  try {
    const profile = parseProfileResponse(accumulated);
    await saveProfile(userId, profile);

    // Upload to S3
    try {
      const { S3Storage } = require('@/storage/s3Client');
      const storage = new S3Storage({
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
        region: config.aws.region,
        bucket: config.aws.s3Bucket,
      });

      const readmeKey = `profiles/${userId}/readme.md`;
      const profileKey = `profiles/${userId}/profile.json`;

      await Promise.all([
        storage.upload(readmeKey, profile.readmeMarkdown, 'text/markdown'),
        storage.upload(profileKey, JSON.stringify(profile, null, 2), 'application/json'),
      ]);

      await db.profile.update({
        where: { userId },
        data: { s3ReadmeKey: readmeKey, s3ProfileKey: profileKey },
      });
    } catch (s3Err) {
      logger.warn({ s3Err, userId }, 'S3 upload failed after generation — profile saved to DB only');
    }

    res.write(`data: ${JSON.stringify({ type: 'done', profile })}\n\n`);
  } catch (err) {
    logger.error({ err, userId }, 'Failed to parse or save generated profile');
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to parse generated profile.' })}\n\n`);
  }

  res.end();
}

/**
 * Non-streaming profile generation — used for background generation tasks.
 */
export async function generateProfile(userId: string): Promise<void> {
  const config = loadConfig();
  const claude = new ClaudeClient(config.anthropic.apiKey);

  const context = await buildContext(userId);
  if (!context) {
    throw new Error(`No analysis data for user ${userId}`);
  }

  const prompt = buildProfilePrompt(context);
  const raw = await claude.complete(prompt);
  const profile = parseProfileResponse(raw);

  await saveProfile(userId, profile);

  logger.info({ userId }, 'Profile generated and saved');
}
