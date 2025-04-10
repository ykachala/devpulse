/**
 * Integration tests for the profile retrieval API.
 * Mocks AI generator and S3 to avoid external I/O in CI.
 * Requires TEST_DATABASE_URL environment variable.
 */
import request from 'supertest';
import { faker } from '@faker-js/faker';
import { createApp } from '@/api/server';
import { db } from '@/db/client';
import { signToken } from '@/auth/jwt';
import { factory } from '../helpers/factory';

// Skip integration tests if no test database is configured
const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const describeIf = TEST_DB_URL ? describe : describe.skip;

// Mock AI generator to avoid real Anthropic calls
jest.mock('@/ai/generator', () => ({
  generateProfileStream: jest.fn().mockImplementation(
    (_userId: string, res: { write: (s: string) => void; end: () => void }) => {
      res.write(`data: ${JSON.stringify({ type: 'token', token: 'Hello' })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
      return Promise.resolve();
    }
  ),
  generateProfile: jest.fn().mockResolvedValue(undefined),
}));

// Mock S3 to avoid real AWS calls
jest.mock('@/storage/s3Client', () => ({
  S3Storage: jest.fn().mockImplementation(() => ({
    upload: jest.fn().mockResolvedValue(undefined),
    getPresignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
  })),
}));

describeIf('Profile Integration', () => {
  const app = createApp();

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
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  /**
   * Creates a user in the database and returns a signed JWT.
   */
  async function seedUserWithToken(): Promise<{
    userId: string;
    login: string;
    token: string;
  }> {
    const userId = faker.string.uuid();
    const login = faker.internet.userName();

    await db.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        githubId: faker.number.int({ min: 100000, max: 9999999 }),
        login,
        avatarUrl: faker.image.avatarGitHub(),
      },
      update: {},
    });

    const token = signToken(
      { sub: userId, login },
      process.env['JWT_SECRET'] ?? 'test-secret-for-integration',
      '7d'
    );

    return { userId, login, token };
  }

  describe('GET /api/v1/profile', () => {
    it('returns 401 without an Authorization header', async () => {
      const response = await request(app).get('/api/v1/profile');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 404 when no analysis exists for the user', async () => {
      const { userId, token } = await seedUserWithToken();

      const response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);

      await db.user.delete({ where: { id: userId } });
    });

    it('returns analysis data when it exists for the user', async () => {
      const { userId, token } = await seedUserWithToken();
      const analysisData = factory.analysisData();

      await db.analysis.upsert({
        where: { userId },
        create: {
          userId,
          techStacks: analysisData.techStacks,
          architectureTags: analysisData.architectureTags,
          seniorityScore: analysisData.seniorityScore,
          consistencyScore: analysisData.consistencyScore,
          commitQuality: analysisData.commitQuality,
          testCoverage: analysisData.testCoverage,
        },
        update: {},
      });

      const response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.techStacks).toBeDefined();
      expect(response.body.data.seniorityScore).toBe(analysisData.seniorityScore);
      expect(response.body.data.consistencyScore).toBe(analysisData.consistencyScore);

      await db.analysis.delete({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    });

    it('does not leak another user\'s analysis data', async () => {
      const { userId: userAId, token: tokenA } = await seedUserWithToken();
      const { userId: userBId } = await seedUserWithToken();
      const analysisData = factory.analysisData();

      // Only user B has analysis
      await db.analysis.upsert({
        where: { userId: userBId },
        create: {
          userId: userBId,
          techStacks: analysisData.techStacks,
          architectureTags: analysisData.architectureTags,
          seniorityScore: analysisData.seniorityScore,
          consistencyScore: analysisData.consistencyScore,
          commitQuality: analysisData.commitQuality,
          testCoverage: analysisData.testCoverage,
        },
        update: {},
      });

      // User A requesting — should get 404
      const response = await request(app)
        .get('/api/v1/profile')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(404);

      await db.analysis.delete({ where: { userId: userBId } });
      await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    });
  });

  describe('GET /api/v1/profile/stacks', () => {
    it('returns 404 when no analysis exists', async () => {
      const { userId, token } = await seedUserWithToken();

      const response = await request(app)
        .get('/api/v1/profile/stacks')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);

      await db.user.delete({ where: { id: userId } });
    });

    it('returns stacks array when analysis exists', async () => {
      const { userId, token } = await seedUserWithToken();
      const analysisData = factory.analysisData();

      await db.analysis.upsert({
        where: { userId },
        create: {
          userId,
          techStacks: analysisData.techStacks,
          architectureTags: analysisData.architectureTags,
          seniorityScore: analysisData.seniorityScore,
          consistencyScore: analysisData.consistencyScore,
          commitQuality: analysisData.commitQuality,
          testCoverage: analysisData.testCoverage,
        },
        update: {},
      });

      const response = await request(app)
        .get('/api/v1/profile/stacks')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.stacks)).toBe(true);

      await db.analysis.delete({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    });
  });

  describe('GET /api/v1/profile/readme', () => {
    it('returns 404 when no profile README has been generated', async () => {
      const { userId, token } = await seedUserWithToken();

      const response = await request(app)
        .get('/api/v1/profile/readme')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);

      await db.user.delete({ where: { id: userId } });
    });

    it('returns readme markdown when a profile exists', async () => {
      const { userId, token } = await seedUserWithToken();
      const readme = `# ${faker.internet.userName()}\n\n${faker.lorem.paragraph()}`;

      await db.profile.upsert({
        where: { userId },
        create: {
          userId,
          readmeMarkdown: readme,
        },
        update: { readmeMarkdown: readme },
      });

      const response = await request(app)
        .get('/api/v1/profile/readme')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.readme).toBe(readme);

      await db.profile.delete({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    });
  });

  describe('GET /api/v1/profile/export', () => {
    it('returns 404 when no profile export (S3 key) is available', async () => {
      const { userId, token } = await seedUserWithToken();

      const response = await request(app)
        .get('/api/v1/profile/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);

      await db.user.delete({ where: { id: userId } });
    });

    it('returns a presigned URL when an S3 key is stored on the profile', async () => {
      const { userId, token } = await seedUserWithToken();
      const s3Key = `profiles/${userId}/profile.json`;

      await db.profile.upsert({
        where: { userId },
        create: {
          userId,
          s3ProfileKey: s3Key,
        },
        update: { s3ProfileKey: s3Key },
      });

      const response = await request(app)
        .get('/api/v1/profile/export')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.url).toBe('string');
      expect(response.body.data.expiresIn).toBe(3600);

      await db.profile.delete({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    });
  });
});
