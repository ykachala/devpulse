/**
 * IoRedis singleton — provides a shared Redis connection across the application.
 */
import Redis from 'ioredis';
import { logger } from '@/logger';

let redisInstance: Redis | null = null;

/**
 * Returns the IoRedis singleton, creating it if it does not yet exist.
 * @param url - Redis connection URL (required on first call)
 */
export function getRedis(url?: string): Redis {
  if (!redisInstance) {
    if (!url) {
      throw new Error('Redis URL is required for initial connection');
    }
    redisInstance = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    redisInstance.on('error', (err: Error) => {
      logger.error({ err }, 'Redis error');
    });

    redisInstance.on('connect', () => {
      logger.info('Redis connection established');
    });
  }
  return redisInstance;
}
