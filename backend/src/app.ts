/**
 * Express app factory — kept free of side effects so tests can mount it
 * with supertest without listening on a port.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError, type ZodType } from 'zod';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { AppError } from './errors.js';
import { registerRoutes } from './routes/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== 'test' && env.LOG_LEVEL !== 'silent',
      customProps: () => ({ svc: 'api' }),
    }),
  );

  registerRoutes(app);

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Route not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
      return;
    }
    if (err instanceof ZodError) {
      res.status(422).json({
        error: 'validation_error',
        message: 'Request validation failed',
        details: err.issues,
      });
      return;
    }
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal_error', message: 'Internal server error' });
  });

  return app;
}

/** Parse with a Zod schema or throw ZodError (handled by the error middleware). */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  return schema.parse(data);
}
