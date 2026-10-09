/**
 * Contract-driven router: every route in @sih/contracts `routes[]` is mounted
 * here with its auth guard + Zod-parsed params/query/body. Routes without a
 * real handler get an explicit 501 stub (never silently missing).
 */
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { routes } from '@sih/contracts';
import { authGuard } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { handlers, stubRoutes } from './handlers/index.js';
import { registerTus } from './tus.js';
import { registerVerifyPage } from './verify.js';

type AppMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

export function registerRoutes(app: Express): void {
  const mount = app as unknown as Record<AppMethod, (path: string, ...h: RequestHandler[]) => void>;

  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Missing handler for contract route: ${key}`);

    const guard = authGuard(route.auth);

    const wrapped: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        const params = (route.params ? route.params.parse(req.params) : req.params) as Record<string, unknown>;
        const query = route.query ? route.query.parse(req.query) : undefined;
        const body = route.body ? route.body.parse(req.body ?? {}) : undefined;
        const result = await handler({ req, res, params, query, body, user: req.user });
        // undefined = handler wrote the response itself (streams: PDF, bytes)
        if (result === undefined) return;
        res.status(result.status ?? route.status ?? 200).json(result.data ?? {});
      })().catch(next);
    };

    mount[route.method](route.path, guard, wrapped);
  }

  // tus byte transport for evidence uploads (protocol route, not in routes[])
  registerTus(app);

  // Human-facing QR landing page (non-contract; JSON contract route stays at /api/v1/verify)
  registerVerifyPage(app);

  if (stubRoutes.length > 0) {
    logger.warn({ count: stubRoutes.length, routes: stubRoutes }, 'contract routes without handlers (501 stubs)');
  }
}
