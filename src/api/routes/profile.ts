/**
 * Profile API routes.
 *
 * GET /api/v1/profile            — Get analysis data for authenticated user
 * GET /api/v1/profile/stacks     — Get detected tech stacks
 * GET /api/v1/profile/generate   — Stream AI profile generation via SSE
 * GET /api/v1/profile/readme     — Get generated README markdown
 * GET /api/v1/profile/export     — Get presigned S3 download URL for profile export
 */
import { Router, Request, Response } from 'express';
import { authMiddleware } from '@/auth/middleware';
import { db } from '@/db/client';
import { logger } from '@/logger';

export const profileRouter = Router();

profileRouter.use(authMiddleware);

/**
 * GET /api/v1/profile
 * Returns the user's analysis record with tech stacks, architecture tags,
 * seniority score, and consistency score.
 */
profileRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const analysis = await db.analysis.findUnique({ where: { userId } });
    if (!analysis) {
      res.status(404).json({ success: false, data: null, message: 'No analysis found. Trigger a sync first.' });
      return;
    }

    res.json({
      success: true,
      data: {
        techStacks: analysis.techStacks,
        architectureTags: analysis.architectureTags,
        seniorityScore: analysis.seniorityScore,
        consistencyScore: analysis.consistencyScore,
        commitQuality: analysis.commitQuality,
        testCoverage: analysis.testCoverage,
      },
      message: 'Profile analysis retrieved.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get profile');
    res.status(500).json({ success: false, data: null, message: 'Failed to get profile.' });
  }
});

/**
 * GET /api/v1/profile/stacks
 * Returns the detected tech stacks array from the analysis.
 */
profileRouter.get('/stacks', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const analysis = await db.analysis.findUnique({
      where: { userId },
      select: { techStacks: true },
    });

    if (!analysis) {
      res.status(404).json({ success: false, data: null, message: 'No analysis found.' });
      return;
    }

    res.json({
      success: true,
      data: { stacks: analysis.techStacks },
      message: 'Tech stacks retrieved.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get stacks');
    res.status(500).json({ success: false, data: null, message: 'Failed to get stacks.' });
  }
});

/**
 * GET /api/v1/profile/generate
 * Server-Sent Events endpoint — streams AI profile generation tokens in real time.
 */
profileRouter.get('/generate', async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.sub;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { generateProfileStream } = require('@/ai/generator');
    await generateProfileStream(userId, res);
  } catch (err) {
    logger.error({ err, userId }, 'SSE profile generation failed');
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Generation failed.' })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/v1/profile/readme
 * Returns the generated README markdown for the authenticated user.
 */
profileRouter.get('/readme', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const profile = await db.profile.findUnique({
      where: { userId },
      select: { readmeMarkdown: true },
    });

    if (!profile || !profile.readmeMarkdown) {
      res.status(404).json({ success: false, data: null, message: 'No README generated yet.' });
      return;
    }

    res.json({
      success: true,
      data: { readme: profile.readmeMarkdown },
      message: 'README retrieved.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to get README');
    res.status(500).json({ success: false, data: null, message: 'Failed to get README.' });
  }
});

/**
 * GET /api/v1/profile/export
 * Returns a presigned S3 URL to download the full profile JSON.
 * Valid for 1 hour.
 */
profileRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;

    const profile = await db.profile.findUnique({
      where: { userId },
      select: { s3ProfileKey: true },
    });

    if (!profile || !profile.s3ProfileKey) {
      res.status(404).json({ success: false, data: null, message: 'No profile export available. Generate a profile first.' });
      return;
    }

    const { loadConfig } = require('@/config');
    const { S3Storage } = require('@/storage/s3Client');
    const config = loadConfig();

    const storage = new S3Storage({
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
      region: config.aws.region,
      bucket: config.aws.s3Bucket,
    });

    const url = await storage.getPresignedUrl(profile.s3ProfileKey, 3600);

    res.json({
      success: true,
      data: { url, expiresIn: 3600 },
      message: 'Presigned export URL generated.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to generate export URL');
    res.status(500).json({ success: false, data: null, message: 'Failed to generate export URL.' });
  }
});
