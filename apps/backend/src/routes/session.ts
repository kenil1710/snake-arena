import { Router } from 'express';
import { z } from 'zod';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { POWER_UP_TYPES, type GameState } from '@snake-arena/shared';
import type { BackendConfig } from '../config.js';
import type { EngineState } from '../game-engine/snake.js';
import type { ChainVerifier } from '../chain/verify.js';
import type { ScoreSigner } from '../signer/sign.js';
import { generateNonce } from '../signer/sign.js';
import { EntryAlreadyUsedError, type GameSession, type SessionManager } from '../session/manager.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { validateBody } from '../middleware/validate.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('routes/session');

/** Sessions with more rate violations than this don't get their score signed. */
export const CHEAT_FLAG_LIMIT = 100;

const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 0x-prefixed 32-byte hex string')
  .transform((value) => value as Hex);

const addressSchema = z
  .string()
  .refine((value) => isAddress(value), 'must be a valid EVM address')
  .transform((value) => getAddress(value));

const startSchema = z.object({
  walletAddress: addressSchema,
  tournamentId: z.number().int().positive(),
  entryTxHash: hex32,
});

const moveSchema = z.object({
  sessionId: hex32,
  direction: z.enum(['UP', 'DOWN', 'LEFT', 'RIGHT']),
});

const powerUpSchema = z.object({
  sessionId: hex32,
  powerUpType: z.enum(POWER_UP_TYPES),
  txHash: hex32,
});

const endSchema = z.object({
  sessionId: hex32,
});

export interface SessionRouterDeps {
  config: Pick<BackendConfig, 'chainId' | 'snakeArenaAddress'>;
  sessions: SessionManager;
  verifier: ChainVerifier;
  signer: ScoreSigner;
  /** Injectable clock for tests. */
  now?: () => number;
}

/** Wire format: shared GameState plus the engine's extra fields. */
type WireGameState = GameState & Omit<EngineState, keyof GameState>;

function toWireState(session: GameSession, state: EngineState): WireGameState {
  return { sessionId: session.id, ...state };
}

export function createSessionRouter(deps: SessionRouterDeps): Router {
  const { config, sessions, verifier, signer } = deps;
  const now = deps.now ?? Date.now;
  const router = Router();

  function requireSession(sessionId: Hex): GameSession {
    const session = sessions.getSession(sessionId);
    if (!session) {
      throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found or expired');
    }
    return session;
  }

  router.post(
    '/start',
    validateBody(startSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof startSchema>;

      if (sessions.hasEntryBeenUsed(body.entryTxHash)) {
        res.status(409).json({
          error: 'ENTRY_ALREADY_USED',
          message: 'This entry transaction already started a game session',
        });
        return;
      }

      const verification = await verifier.verifyEntry({
        txHash: body.entryTxHash,
        walletAddress: body.walletAddress as Address,
        tournamentId: body.tournamentId,
      });
      if (!verification.ok) {
        res.status(400).json({ error: 'ENTRY_VERIFICATION_FAILED', message: verification.reason });
        return;
      }

      let session: GameSession;
      try {
        session = sessions.createSession({
          walletAddress: body.walletAddress as Address,
          tournamentId: body.tournamentId,
          entryTxHash: body.entryTxHash,
        });
      } catch (error) {
        if (error instanceof EntryAlreadyUsedError) {
          res.status(409).json({ error: 'ENTRY_ALREADY_USED', message: error.message });
          return;
        }
        throw error;
      }

      logger.info('session started', {
        sessionId: session.id,
        wallet: session.walletAddress,
        tournamentId: session.tournamentId,
      });
      res.status(201).json({
        sessionId: session.id,
        initialState: toWireState(session, session.game.serialize(now())),
      });
    }),
  );

  router.post('/move', validateBody(moveSchema), (req, res) => {
    const body = req.body as z.infer<typeof moveSchema>;
    const session = requireSession(body.sessionId);
    const timestamp = now();

    const result = session.game.applyMove(body.direction, timestamp);
    if (result.reason === 'GAME_OVER') {
      res.status(409).json({
        error: 'GAME_OVER',
        message: 'Game already ended — call /api/session/end to collect the signed score',
        state: toWireState(session, session.game.serialize(timestamp)),
      });
      return;
    }
    if (result.reason === 'RATE_LIMITED') {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many moves per second — move ignored',
        state: toWireState(session, session.game.serialize(timestamp)),
      });
      return;
    }

    // Accepted, or a 180° reversal (input ignored): the tick advances either way.
    const state = session.game.step(timestamp);
    res.json({
      state: toWireState(session, state),
      moveAccepted: result.accepted,
      ...(result.reason === 'REVERSAL' ? { note: '180° reversal ignored' } : {}),
    });
  });

  router.post(
    '/powerup',
    validateBody(powerUpSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof powerUpSchema>;
      const session = requireSession(body.sessionId);

      // Claim the tx before the async verification so a concurrent duplicate
      // request can't double-activate; released again on any failure below.
      if (!sessions.markPowerUpTxUsed(body.txHash)) {
        res.status(409).json({
          error: 'TX_ALREADY_USED',
          message: 'This payment transaction already activated a power-up',
        });
        return;
      }

      const verification = await verifier.verifyPowerUpPurchase({
        txHash: body.txHash,
        walletAddress: session.walletAddress,
        sessionId: session.id,
        powerUpType: body.powerUpType,
      });
      if (!verification.ok) {
        sessions.releasePowerUpTx(body.txHash);
        res.status(400).json({ error: 'POWERUP_VERIFICATION_FAILED', message: verification.reason });
        return;
      }

      const timestamp = now();
      if (!session.game.activatePowerUp(body.powerUpType, timestamp)) {
        // Not applicable right now (e.g. revive while alive, shield while shielded):
        // leave the purchase unconsumed so it can be activated when it applies.
        sessions.releasePowerUpTx(body.txHash);
        res.status(409).json({
          error: 'POWERUP_NOT_APPLICABLE',
          message: `Cannot activate ${body.powerUpType} in the current game state`,
          state: toWireState(session, session.game.serialize(timestamp)),
        });
        return;
      }

      logger.info('power-up activated', { sessionId: session.id, type: body.powerUpType, tx: body.txHash });
      res.json({ state: toWireState(session, session.game.serialize(timestamp)) });
    }),
  );

  router.post(
    '/end',
    validateBody(endSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof endSchema>;
      const session = requireSession(body.sessionId);

      if (session.game.isAlive) {
        res.status(409).json({
          error: 'GAME_NOT_OVER',
          message: 'The game is still in progress — scores are only signed after death',
        });
        return;
      }

      // Idempotent: a finished run signs exactly one (score, nonce) pair.
      if (session.signedResult) {
        res.json(session.signedResult);
        return;
      }

      if (session.game.cheatFlagCount > CHEAT_FLAG_LIMIT) {
        logger.warn('refusing to sign score for flagged session', {
          sessionId: session.id,
          flags: session.game.cheatFlagCount,
        });
        res.status(403).json({
          error: 'CHEAT_SUSPECTED',
          message: 'Session exceeded the move-rate violation threshold',
        });
        return;
      }

      const nonce = generateNonce();
      const score = session.game.currentScore;
      const signature = await signer.signScore({
        tournamentId: BigInt(session.tournamentId),
        player: session.walletAddress,
        score: BigInt(score),
        nonce,
        contractAddress: config.snakeArenaAddress,
        chainId: BigInt(config.chainId),
      });

      session.signedResult = {
        tournamentId: session.tournamentId,
        walletAddress: session.walletAddress,
        score,
        nonce,
        signature,
        contractAddress: config.snakeArenaAddress,
        chainId: config.chainId,
      };

      logger.info('score signed', {
        sessionId: session.id,
        wallet: session.walletAddress,
        tournamentId: session.tournamentId,
        score,
      });
      res.json(session.signedResult);
    }),
  );

  return router;
}
