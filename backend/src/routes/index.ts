/**
 * Route mounting. Phase-by-phase this file fills up; contract stays in
 * @sih/contracts (routes[]).
 */
import type { Express, Request, Response } from 'express';
import { DateTime } from '@sih/contracts';
import { env } from '../config/env.js';
import { AppError } from '../errors.js';

const startedAt = Date.now();

export function registerRoutes(app: Express) {
  app.get('/health', (_req: Request, res: Response) => {
    const now = DateTime.parse(new Date().toISOString());
    res.json({
      status: 'ok',
      service: 'sih26242-rpl-api',
      version: `v1/${env.NODE_ENV}`,
      time: now,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      checks: {
        runtime: { status: 'up' },
      },
    });
  });

  app.get('/api/v1/meta/version', (_req: Request, res: Response) => {
    res.json({ apiVersion: '1', node: process.version, time: DateTime.parse(new Date().toISOString()) });
  });

  app.get('/api/v1/_routes', (_req: Request, res: Response) => {
    res.json({ note: 'see contracts/openapi.json' });
  });

  // Explicit not-a-route so future mount groups don't shadow it
  app.get('/api/v1', (_req: Request, _res: Response) => {
    throw new AppError(404, 'not_found', 'Use a versioned route (see openapi.json)');
  });
}
