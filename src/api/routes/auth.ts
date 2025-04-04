/**
 * GitHub OAuth routes.
 *
 * GET /api/v1/auth/github    — Generate OAuth URL with CSRF state token
 * GET /api/v1/auth/callback  — Exchange code for token, issue JWT
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { loadConfig } from '@/config';
import { getRedis } from '@/redis/client';
import { encryptToken } from '@/auth/crypto';
import { signToken } from '@/auth/jwt';
import { upsert } from '@/db/userRepository';
import { db } from '@/db/client';
import { logger } from '@/logger';

export const authRouter = Router();

const OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes

/**
 * Initiates the GitHub OAuth flow.
 * Stores a random state token in Redis for CSRF protection.
 */
authRouter.get('/github', async (_req: Request, res: Response): Promise<void> => {
  try {
    const config = loadConfig();
    const state = crypto.randomBytes(16).toString('hex');
    const redis = getRedis();
    await redis.set(`oauth:state:${state}`, '1', 'EX', OAUTH_STATE_TTL_SECONDS);

    const params = new URLSearchParams({
      client_id: config.github.clientId,
      redirect_uri: config.github.callbackUrl,
      scope: 'read:user user:email repo',
      state,
    });

    const url = `https://github.com/login/oauth/authorize?${params.toString()}`;
    res.json({ success: true, data: { url }, message: 'OAuth URL generated.' });
  } catch (err) {
    logger.error({ err }, 'Failed to generate OAuth URL');
    res.status(500).json({ success: false, data: null, message: 'Failed to generate OAuth URL.' });
  }
});

/**
 * Handles the GitHub OAuth callback.
 * Validates CSRF state, exchanges code for access token, upserts user, issues JWT.
 */
authRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const config = loadConfig();
    const { code, state } = req.query as { code?: string; state?: string };

    if (!code || !state) {
      res.status(400).json({ success: false, data: null, message: 'Missing code or state parameter.' });
      return;
    }

    // Validate CSRF state
    const redis = getRedis();
    const stateKey = `oauth:state:${state}`;
    const storedState = await redis.get(stateKey);
    if (!storedState) {
      res.status(400).json({ success: false, data: null, message: 'Invalid or expired OAuth state.' });
      return;
    }
    await redis.del(stateKey);

    // Exchange code for GitHub access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
        redirect_uri: config.github.callbackUrl,
      }),
    });

    if (!tokenResponse.ok) {
      res.status(502).json({ success: false, data: null, message: 'Failed to exchange OAuth code.' });
      return;
    }

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      scope?: string;
      error?: string;
    };

    if (!tokenData.access_token || tokenData.error) {
      res.status(400).json({ success: false, data: null, message: tokenData.error ?? 'GitHub OAuth error.' });
      return;
    }

    // Fetch authenticated GitHub user
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!userResponse.ok) {
      res.status(502).json({ success: false, data: null, message: 'Failed to fetch GitHub user.' });
      return;
    }

    const githubUser = await userResponse.json() as {
      id: number;
      login: string;
      email: string | null;
      name: string | null;
      avatar_url: string;
    };

    // Upsert user record
    const user = await upsert({
      githubId: githubUser.id,
      login: githubUser.login,
      email: githubUser.email,
      name: githubUser.name,
      avatarUrl: githubUser.avatar_url,
    });

    // Encrypt and persist OAuth token
    const { encrypted, iv, tag } = encryptToken(tokenData.access_token, config.tokenEncryptionKey);
    const scopes = tokenData.scope ? tokenData.scope.split(',').map((s) => s.trim()) : [];

    await db.oAuthToken.upsert({
      where: { userId: user.id },
      update: { encryptedToken: encrypted, tokenIv: iv, tokenTag: tag, scopes },
      create: { userId: user.id, encryptedToken: encrypted, tokenIv: iv, tokenTag: tag, scopes },
    });

    // Issue application JWT
    const token = signToken(
      { sub: user.id, login: user.login },
      config.jwt.secret,
      config.jwt.expiresIn
    );

    res.json({ success: true, data: { token }, message: 'Authentication successful.' });
  } catch (err) {
    logger.error({ err }, 'OAuth callback error');
    res.status(500).json({ success: false, data: null, message: 'Authentication failed.' });
  }
});
