/**
 * Organisations API routes.
 *
 * POST /api/v1/orgs                — Create a new organisation
 * POST /api/v1/orgs/:id/members    — Add a user to an organisation
 * GET  /api/v1/orgs/:id/report     — Get aggregate team tech report
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { authMiddleware } from '@/auth/middleware';
import { orgMiddleware } from '@/auth/orgMiddleware';
import { db } from '@/db/client';
import { logger } from '@/logger';

export const orgsRouter = Router();

/**
 * POST /api/v1/orgs
 * Creates a new organisation. The requesting user becomes the owner.
 * Returns the org with the plaintext API key — this is the only time it is shown.
 */
orgsRouter.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.sub;
    const { name } = req.body as { name?: string };

    if (!name || typeof name !== 'string' || name.trim().length < 1) {
      res.status(400).json({ success: false, data: null, message: 'Organisation name is required.' });
      return;
    }

    // Generate a random API key and store its SHA-256 hash
    const apiKey = crypto.randomBytes(32).toString('hex');
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const org = await db.org.create({
      data: {
        name: name.trim(),
        apiKeyHash,
        members: {
          create: { userId, role: 'owner' },
        },
      },
    });

    logger.info({ orgId: org.id, userId }, 'Organisation created');

    res.status(201).json({
      success: true,
      data: { id: org.id, name: org.name, apiKey },
      message: 'Organisation created. Save the API key — it will not be shown again.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to create organisation');
    res.status(500).json({ success: false, data: null, message: 'Failed to create organisation.' });
  }
});

/**
 * POST /api/v1/orgs/:id/members
 * Adds a user to the organisation by their GitHub login.
 * Requires organisation API key authentication.
 */
orgsRouter.post('/:id/members', orgMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.params['id'];
    const org = req.org;

    if (!org || org.id !== orgId) {
      res.status(403).json({ success: false, data: null, message: 'Forbidden.' });
      return;
    }

    const { login } = req.body as { login?: string };
    if (!login) {
      res.status(400).json({ success: false, data: null, message: 'GitHub login is required.' });
      return;
    }

    const user = await db.user.findUnique({ where: { login } });
    if (!user) {
      res.status(404).json({ success: false, data: null, message: 'User not found.' });
      return;
    }

    const member = await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      update: {},
      create: { orgId, userId: user.id, role: 'member' },
    });

    res.status(201).json({
      success: true,
      data: { id: member.id, orgId, userId: user.id, role: member.role },
      message: 'Member added to organisation.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to add org member');
    res.status(500).json({ success: false, data: null, message: 'Failed to add member.' });
  }
});

/**
 * GET /api/v1/orgs/:id/report
 * Returns an aggregate tech stack and pattern report for all org members.
 * Requires organisation API key authentication.
 */
orgsRouter.get('/:id/report', orgMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const orgId = req.params['id'];
    const org = req.org;

    if (!org || org.id !== orgId) {
      res.status(403).json({ success: false, data: null, message: 'Forbidden.' });
      return;
    }

    // Load all members and their analyses
    const members = await db.orgMember.findMany({
      where: { orgId },
      include: {
        user: {
          include: { analysis: true },
        },
      },
    });

    // Aggregate tech stacks
    const stackFrequency = new Map<string, number>();
    const allArchitectureTags = new Set<string>();
    let totalSeniority = 0;
    let membersWithAnalysis = 0;

    const memberSummaries = members.map((m) => {
      const analysis = m.user.analysis;
      if (analysis) {
        membersWithAnalysis++;
        totalSeniority += analysis.seniorityScore;

        const stacks = analysis.techStacks as Array<{ name: string; confidence: number }>;
        for (const stack of stacks) {
          stackFrequency.set(stack.name, (stackFrequency.get(stack.name) ?? 0) + 1);
        }

        for (const tag of analysis.architectureTags) {
          allArchitectureTags.add(tag);
        }
      }

      return {
        userId: m.userId,
        login: m.user.login,
        role: m.role,
        seniorityScore: analysis?.seniorityScore ?? null,
        topStacks: analysis
          ? (analysis.techStacks as Array<{ name: string; confidence: number }>)
              .slice(0, 3)
              .map((s) => s.name)
          : [],
      };
    });

    // Top 5 stacks by frequency
    const topStacks = Array.from(stackFrequency.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, memberCount: count }));

    const avgSeniority = membersWithAnalysis > 0 ? totalSeniority / membersWithAnalysis : 0;

    res.json({
      success: true,
      data: {
        memberCount: members.length,
        topStacks,
        architectureTags: Array.from(allArchitectureTags),
        avgSeniority,
        members: memberSummaries,
      },
      message: 'Organisation report generated.',
    });
  } catch (err) {
    logger.error({ err }, 'Failed to generate org report');
    res.status(500).json({ success: false, data: null, message: 'Failed to generate report.' });
  }
});
