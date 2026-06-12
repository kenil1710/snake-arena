import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type Response } from 'express';
import type { BackendConfig } from '../config.js';
import type { SweepResult } from '../cron/tournamentFinalizer.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes/admin');

export interface AdminRouterDeps {
  config: Pick<BackendConfig, 'adminSecret'>;
  /** Null when the keeper is disabled (CRON_ENABLED=false). */
  finalizer: { checkAndFinalizeAll(): Promise<SweepResult> } | null;
}

/** Compares via fixed-size digests so length and content leak no timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** res.json chokes on the bigints in chain results — stringify them instead. */
function sendJson(res: Response, body: unknown): void {
  res
    .type('application/json')
    .send(JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)));
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();

  router.use((req, _res, next) => {
    const expected = deps.config.adminSecret;
    if (!expected) {
      next(new ApiError(503, 'ADMIN_DISABLED', 'Set ADMIN_SECRET to enable admin endpoints'));
      return;
    }
    const provided = req.get('x-admin-secret');
    if (!provided || !secretMatches(provided, expected)) {
      next(new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid x-admin-secret header'));
      return;
    }
    next();
  });

  // Forces an immediate finalization sweep instead of waiting for the next
  // cron tick — same code path, same locks.
  router.post(
    '/finalize-now',
    asyncHandler(async (_req, res) => {
      if (!deps.finalizer) {
        throw new ApiError(503, 'CRON_DISABLED', 'Tournament keeper is not running (CRON_ENABLED=false)');
      }
      logger.info('manual finalization sweep triggered');
      const result = await deps.finalizer.checkAndFinalizeAll();
      sendJson(res, result);
    }),
  );

  return router;
}
