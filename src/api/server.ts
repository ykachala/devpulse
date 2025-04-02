/**
 * Express application factory.
 * Mounts all routers, adds pino-http middleware, error handler, and health check.
 */
import express, { Application, Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '@/logger';

export function createApp(): Application {
  const app = express();

  app.use(express.json());
  app.use(
    pinoHttp({
      logger,
      autoLogging: true,
    })
  );

  // Health check — unauthenticated
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ success: true, data: { status: 'ok' }, message: 'Service is healthy.' });
  });

  // Mount route modules lazily to avoid circular imports at module load time
  // Routes are registered after DB/Redis connections are established in index.ts
  app.use('/api/v1/auth', require('@/api/routes/auth').authRouter);
  app.use('/api/v1/sync', require('@/api/routes/sync').syncRouter);
  app.use('/api/v1/profile', require('@/api/routes/profile').profileRouter);
  app.use('/api/v1/orgs', require('@/api/routes/orgs').orgsRouter);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, data: null, message: 'Route not found.' });
  });

  // Global error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ success: false, data: null, message: 'Internal server error.' });
  });

  return app;
}
