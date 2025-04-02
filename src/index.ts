/**
 * Application entry point.
 * Loads config, connects Redis, starts HTTP server, handles graceful shutdown.
 */
import { loadConfig } from '@/config';
import { logger } from '@/logger';
import { createApp } from '@/api/server';
import { getRedis } from '@/redis/client';
import { getIngestionQueue, closeIngestionQueue } from '@/ingestion/queue';
import { db } from '@/db/client';

async function main(): Promise<void> {
  const config = loadConfig();

  // Verify Redis connection
  const redis = getRedis(config.redisUrl);
  await redis.ping();
  logger.info('Redis connected');

  // Initialise BullMQ queue (creates the connection)
  getIngestionQueue(config.redisUrl);
  logger.info('Ingestion queue initialised');

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'HTTP server listening');
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Received shutdown signal, draining...');
    server.close(async () => {
      try {
        await closeIngestionQueue();
        await redis.quit();
        await db.$disconnect();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
