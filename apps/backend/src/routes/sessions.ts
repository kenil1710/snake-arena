import { Router } from 'express';
import type { Hex } from 'viem';
import type { SessionManager } from '../session/manager.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';

export interface SessionsRouterDeps {
  sessions: SessionManager;
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * Read-only lookups keyed by on-chain tx, mounted at /api/sessions.
 * Kept separate from the stateful /api/session/* game endpoints.
 */
export function createSessionsRouter(deps: SessionsRouterDeps): Router {
  const { sessions } = deps;
  const router = Router();

  // GET /api/sessions/by-tx?txHash=0x...
  // Tells the lobby whether a paid entry was ever turned into a game session,
  // so it can offer to play an entry the user paid for but abandoned.
  router.get(
    '/by-tx',
    asyncHandler(async (req, res) => {
      const txHash = String(req.query.txHash ?? '');
      if (!HEX32.test(txHash)) {
        throw new ApiError(400, 'INVALID_TX_HASH', 'txHash must be a 0x-prefixed 32-byte hex string');
      }

      const session = sessions.findByEntryTx(txHash as Hex);
      if (session) {
        const status = session.signedResult
          ? 'submitted'
          : session.game.isAlive
            ? 'playing'
            : 'died';
        res.json({ exists: true, sessionId: session.id, status });
        return;
      }

      // No live session: the entry is still considered "played" if it ever
      // started one (the session may simply have aged out of memory).
      res.json({ exists: sessions.hasEntryBeenUsed(txHash) });
    }),
  );

  return router;
}
