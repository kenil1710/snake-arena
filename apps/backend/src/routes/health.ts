import { Router } from 'express';
import type { BackendConfig } from '../config.js';
import type { ScoreSigner } from '../signer/sign.js';

export interface HealthRouterDeps {
  config: Pick<BackendConfig, 'chainId' | 'snakeArenaAddress' | 'powerUpStoreAddress' | 'usdcAddress'>;
  signer: ScoreSigner;
}

export function createHealthRouter(deps: HealthRouterDeps): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      chainId: deps.config.chainId,
      contracts: {
        snakeArena: deps.config.snakeArenaAddress,
        powerUpStore: deps.config.powerUpStoreAddress,
        usdc: deps.config.usdcAddress,
      },
      // Public on-chain state anyway (SnakeArena.trustedSigner) — handy for ops.
      trustedSigner: deps.signer.address,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
