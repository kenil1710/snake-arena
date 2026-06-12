import express, { type Express } from 'express';
import cors from 'cors';
import type { BackendConfig } from './config.js';
import type { SessionManager } from './session/manager.js';
import type { ChainVerifier } from './chain/verify.js';
import type { ScoreSigner } from './signer/sign.js';
import { createSessionRouter } from './routes/session.js';
import { createHealthRouter } from './routes/health.js';
import { createAdminRouter, type AdminRouterDeps } from './routes/admin.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('http');

export interface AppDeps {
  config: BackendConfig;
  sessions: SessionManager;
  verifier: ChainVerifier;
  signer: ScoreSigner;
  /** Tournament keeper; absent when CRON_ENABLED=false. */
  finalizer?: AdminRouterDeps['finalizer'];
  /** Injectable clock for tests. */
  now?: () => number;
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(cors({ origin: deps.config.corsOrigins }));
  app.use(express.json());

  // Request logging (skip the noisy per-tick /move endpoint).
  app.use((req, res, next) => {
    if (req.path !== '/api/session/move') {
      const startedAt = Date.now();
      res.on('finish', () => {
        logger.info(`${req.method} ${req.path}`, { status: res.statusCode, ms: Date.now() - startedAt });
      });
    }
    next();
  });

  app.use('/api', createHealthRouter(deps));
  app.use('/api/session', createSessionRouter(deps));
  app.use('/api/admin', createAdminRouter({ config: deps.config, finalizer: deps.finalizer ?? null }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
