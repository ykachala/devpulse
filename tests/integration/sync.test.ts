/**
 * Integration tests for the sync pipeline API.
 * Mocks BullMQ queue to avoid real Redis/worker dependency.
 * Requires TEST_DATABASE_URL environment variable.
 */
import request from 'supertest';
import { faker } from '@faker-js/faker';
import { createApp } from '@/api/server';
import { db } from '@/db/client';
import { signToken } from '@/auth/jwt';

// Skip integration tests if no test database is configured
const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const describeIf = TEST_DB_URL ? describe : describe.skip;

// Mock the BullMQ queue to avoid real Redis dependency in sync tests
jest.mock('@/ingestion/queue', () => ({
  getIngestionQueue: jest.fn().mockReturnValue({
    add: jest.fn().mockResolvedValue({ id: 'mocked-bull-job-id' }),
  }),
  closeIngestionQueue: jest.fn().mockResolvedValue(undefined),
}));

describeIf('Sync Integration', () => {
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
   * Generates a valid JWT for a given userId and login.
   */
  function makeToken(userId: string, login: string): string {
    return signToken(
      { sub: userId, login },
      process.env['JWT_SECRET'] ?? 'test-secret-for-integration',
      '7d'
    );
  }

  describe('POST /api/v1/sync', () => {
    it('returns 401 without an Authorization header', async () => {
      const response = await request(app).post('/api/v1/sync');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 401 with an invalid JWT', async () => {
      const response = await request(app)
        .post('/api/v1/sync')
        .set('Authorization', 'Bearer not.a.valid.token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 202 with a valid JWT and enqueues a sync job', async () => {
      const userId = faker.string.uuid();
      const login = faker.internet.userName();
      const token = makeToken(userId, login);

      // Create the user in DB so the sync job FK constraint is satisfied
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

      const response = await request(app)
        .post('/api/v1/sync')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(202);
      expect(response.body.success).toBe(true);
      expect(response.body.data.jobId).toBeDefined();
      expect(response.body.data.status).toBe('pending');

      // Clean up
      await db.syncJob.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    });
  });

  describe('GET /api/v1/sync/status', () => {
    it('returns 401 without an Authorization header', async () => {
      const response = await request(app).get('/api/v1/sync/status');
      expect(response.status).toBe(401);
    });

    it('returns 404 when no sync jobs exist for the user', async () => {
      const userId = faker.string.uuid();
      const token = makeToken(userId, faker.internet.userName());

      const response = await request(app)
        .get('/api/v1/sync/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('returns the most recent sync job for the authenticated user', async () => {
      const userId = faker.string.uuid();
      const login = faker.internet.userName();
      const token = makeToken(userId, login);

      // Create the user in DB
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

      // Seed a sync job
      const seedJob = await db.syncJob.create({
        data: { userId, status: 'completed', progress: 5, total: 5 },
      });

      const response = await request(app)
        .get('/api/v1/sync/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(seedJob.id);
      expect(response.body.data.status).toBe('completed');

      // Clean up
      await db.syncJob.deleteMany({ where: { userId } });
      await db.user.delete({ where: { id: userId } });
    });

    it('returns only the requesting user\'s sync job, not another user\'s', async () => {
      const userAId = faker.string.uuid();
      const userBId = faker.string.uuid();
      const loginA = faker.internet.userName();
      const loginB = faker.internet.userName();

      await db.user.upsert({
        where: { id: userAId },
        create: {
          id: userAId,
          githubId: faker.number.int({ min: 100000, max: 9999999 }),
          login: loginA,
          avatarUrl: faker.image.avatarGitHub(),
        },
        update: {},
      });
      await db.user.upsert({
        where: { id: userBId },
        create: {
          id: userBId,
          githubId: faker.number.int({ min: 100000, max: 9999999 }),
          login: loginB,
          avatarUrl: faker.image.avatarGitHub(),
        },
        update: {},
      });

      // Create a job for user B only
      const jobB = await db.syncJob.create({
        data: { userId: userBId, status: 'running' },
      });

      // User A requests status — should get 404, not user B's job
      const tokenA = makeToken(userAId, loginA);
      const response = await request(app)
        .get('/api/v1/sync/status')
        .set('Authorization', `Bearer ${tokenA}`);

      expect(response.status).toBe(404);
      expect(response.body.data).toBeNull();
      // Confirm user B's job was NOT leaked
      if (response.body.data) {
        expect(response.body.data.id).not.toBe(jobB.id);
      }

      // Clean up
      await db.syncJob.deleteMany({ where: { userId: userBId } });
      await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    });
  });
});
