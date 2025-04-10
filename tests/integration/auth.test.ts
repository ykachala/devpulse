/**
 * Integration tests for GitHub OAuth flow and JWT authentication.
 * Uses nock to mock all GitHub API calls.
 * Requires TEST_DATABASE_URL environment variable.
 */
import request from 'supertest';
import nock from 'nock';
import { faker } from '@faker-js/faker';
import { createApp } from '@/api/server';
import { db } from '@/db/client';
import { getRedis } from '@/redis/client';
import { signToken } from '@/auth/jwt';
import { factory } from '../helpers/factory';

// Skip integration tests if no test database is configured
const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const describeIf = TEST_DB_URL ? describe : describe.skip;

describeIf('Auth Integration', () => {
  const app = createApp();
  let redis: ReturnType<typeof getRedis>;

  beforeAll(() => {
    process.env['DATABASE_URL'] = TEST_DB_URL ?? '';
    process.env['REDIS_URL'] = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    process.env['JWT_SECRET'] = process.env['JWT_SECRET'] ?? 'test-secret-for-integration';
    process.env['TOKEN_ENCRYPTION_KEY'] =
      process.env['TOKEN_ENCRYPTION_KEY'] ?? '0'.repeat(64);
    process.env['GITHUB_CLIENT_ID'] = 'test-client-id';
    process.env['GITHUB_CLIENT_SECRET'] = 'test-client-secret';
    process.env['ANTHROPIC_API_KEY'] = 'test';
    process.env['AWS_ACCESS_KEY_ID'] = 'test';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'test';
    process.env['AWS_S3_BUCKET'] = 'test-bucket';

    redis = getRedis(process.env['REDIS_URL']);
  });

  afterAll(async () => {
    nock.cleanAll();
    await redis.quit();
    await db.$disconnect();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('GET /api/v1/auth/github', () => {
    it('returns an OAuth URL with a state parameter', async () => {
      const response = await request(app).get('/api/v1/auth/github');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.url).toContain('https://github.com/login/oauth/authorize');
      expect(response.body.data.url).toContain('state=');
      expect(response.body.data.url).toContain('client_id=test-client-id');
    });
  });

  describe('GET /api/v1/auth/callback', () => {
    it('returns a JWT when OAuth flow succeeds', async () => {
      const githubUser = factory.githubUser();
      const accessToken = `gho_${faker.string.alphanumeric(36)}`;

      // Stage a valid state in Redis
      const state = faker.string.alphanumeric(32);
      await redis.set(`oauth:state:${state}`, '1', 'EX', 600);

      // Mock GitHub token exchange
      nock('https://github.com')
        .post('/login/oauth/access_token')
        .reply(200, {
          access_token: accessToken,
          scope: 'repo,read:user,user:email',
          token_type: 'bearer',
        });

      // Mock GitHub user endpoint
      nock('https://api.github.com')
        .get('/user')
        .reply(200, githubUser);

      const response = await request(app)
        .get(`/api/v1/auth/callback?code=test-code&state=${state}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(typeof response.body.data.token).toBe('string');
    });

    it('returns 400 when state is invalid or expired', async () => {
      const response = await request(app)
        .get('/api/v1/auth/callback?code=test-code&state=invalid-state-that-was-never-stored');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 when code is missing', async () => {
      const response = await request(app)
        .get('/api/v1/auth/callback?state=some-state');

      expect(response.status).toBe(400);
    });
  });

  describe('Protected routes', () => {
    it('returns 401 when no Authorization header is provided', async () => {
      const response = await request(app).get('/api/v1/profile');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 401 with an invalid/expired JWT', async () => {
      const response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(response.status).toBe(401);
    });

    it('returns 200 or 404 (not 401) with a valid JWT', async () => {
      const userId = factory.userId();
      const token = signToken(
        { sub: userId, login: faker.internet.userName() },
        process.env['JWT_SECRET'] ?? 'test-secret-for-integration',
        '7d'
      );

      const response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`);

      // 200 (found) or 404 (no analysis yet) — but NOT 401
      expect(response.status).not.toBe(401);
      expect([200, 404]).toContain(response.status);
    });
  });
});
