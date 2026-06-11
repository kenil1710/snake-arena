import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { recoverMessageAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createApp } from '../src/app.js';
import type { BackendConfig } from '../src/config.js';
import type { ChainVerifier, VerificationResult } from '../src/chain/verify.js';
import { SessionManager } from '../src/session/manager.js';
import { buildScoreDigest, createScoreSigner } from '../src/signer/sign.js';

const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
const PLAYER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const ARENA = '0xd25B8F3dfE7B9C5af8a4eE5aD86543918429D49a' as Address;
const STORE = '0x115FCF24E31AA3B970aaf4Be27BbB4e45dbc2ec7' as Address;
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address;

const config: BackendConfig = {
  port: 0,
  chainId: 84532,
  rpcUrl: 'http://unused.invalid',
  snakeArenaAddress: ARENA,
  powerUpStoreAddress: STORE,
  usdcAddress: USDC,
  trustedSignerPrivateKey: TEST_KEY,
  corsOrigins: ['http://localhost:3000'],
};

function txHash(n: number): Hex {
  return `0x${n.toString(16).padStart(64, '0')}` as Hex;
}

describe('API routes', () => {
  let app: Express;
  let sessions: SessionManager;
  let entryResult: VerificationResult;
  let powerUpResult: VerificationResult;
  let verifier: ChainVerifier;

  beforeEach(() => {
    entryResult = { ok: true };
    powerUpResult = { ok: true };
    verifier = {
      verifyEntry: vi.fn(async () => entryResult),
      verifyPowerUpPurchase: vi.fn(async () => powerUpResult),
    };
    sessions = new SessionManager();
    app = createApp({ config, sessions, verifier, signer: createScoreSigner(TEST_KEY) });
  });

  async function startSession(n = 1): Promise<{ sessionId: Hex }> {
    const res = await request(app)
      .post('/api/session/start')
      .send({ walletAddress: PLAYER, tournamentId: 1, entryTxHash: txHash(n) });
    expect(res.status).toBe(201);
    return res.body;
  }

  /** Drives the snake into the right wall: 9 safe moves, the 10th kills it. */
  async function killSnake(sessionId: Hex): Promise<void> {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/session/move').send({ sessionId, direction: 'RIGHT' });
      expect(res.status).toBe(200);
      expect(res.body.state.alive).toBe(i < 9);
    }
  }

  describe('GET /api/health', () => {
    it('reports chain id, contract addresses, and signer', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.chainId).toBe(84532);
      expect(res.body.contracts).toEqual({ snakeArena: ARENA, powerUpStore: STORE, usdc: USDC });
      expect(res.body.trustedSigner).toBe(privateKeyToAccount(TEST_KEY).address);
    });

    it('allows the web app origin via CORS', async () => {
      const res = await request(app).get('/api/health').set('Origin', 'http://localhost:3000');
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('POST /api/session/start', () => {
    it('verifies the entry on-chain and returns a fresh game', async () => {
      const res = await request(app)
        .post('/api/session/start')
        .send({ walletAddress: PLAYER, tournamentId: 3, entryTxHash: txHash(7) });

      expect(res.status).toBe(201);
      expect(res.body.sessionId).toMatch(/^0x[0-9a-f]{64}$/);
      expect(res.body.initialState.sessionId).toBe(res.body.sessionId);
      expect(res.body.initialState.snake).toHaveLength(3);
      expect(res.body.initialState.alive).toBe(true);
      expect(res.body.initialState.apple).not.toBeNull();
      expect(verifier.verifyEntry).toHaveBeenCalledWith({
        txHash: txHash(7),
        walletAddress: PLAYER,
        tournamentId: 3,
      });
    });

    it('rejects a second session for the same entry transaction', async () => {
      await startSession(8);
      const res = await request(app)
        .post('/api/session/start')
        .send({ walletAddress: PLAYER, tournamentId: 1, entryTxHash: txHash(8) });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('ENTRY_ALREADY_USED');
    });

    it('does not consume the entry tx when verification fails', async () => {
      entryResult = { ok: false, reason: 'Transaction reverted' };
      const failed = await request(app)
        .post('/api/session/start')
        .send({ walletAddress: PLAYER, tournamentId: 1, entryTxHash: txHash(9) });
      expect(failed.status).toBe(400);
      expect(failed.body.error).toBe('ENTRY_VERIFICATION_FAILED');
      expect(failed.body.message).toBe('Transaction reverted');

      entryResult = { ok: true };
      await startSession(9); // same tx succeeds after the transient failure
    });

    it('rejects malformed bodies', async () => {
      const res = await request(app)
        .post('/api/session/start')
        .send({ walletAddress: 'not-an-address', tournamentId: 0, entryTxHash: '0x123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('POST /api/session/move', () => {
    it('404s for unknown sessions', async () => {
      const res = await request(app)
        .post('/api/session/move')
        .send({ sessionId: txHash(123), direction: 'UP' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('SESSION_NOT_FOUND');
    });

    it('advances the game one tick per move', async () => {
      const { sessionId } = await startSession();
      const res = await request(app).post('/api/session/move').send({ sessionId, direction: 'RIGHT' });
      expect(res.status).toBe(200);
      expect(res.body.moveAccepted).toBe(true);
      expect(res.body.state.snake[0]).toEqual({ x: 11, y: 10 });
      expect(res.body.state.ticks).toBe(1);
    });

    it('ignores 180° reversals but still advances the tick', async () => {
      const { sessionId } = await startSession();
      const res = await request(app).post('/api/session/move').send({ sessionId, direction: 'LEFT' });
      expect(res.status).toBe(200);
      expect(res.body.moveAccepted).toBe(false);
      expect(res.body.state.direction).toBe('RIGHT');
      expect(res.body.state.snake[0]).toEqual({ x: 11, y: 10 }); // kept heading RIGHT
    });

    it('rate-limits move spam with 429 and flags the session', async () => {
      // Frozen clock => every request lands in the same one-second window.
      const frozenApp = createApp({
        config,
        sessions,
        verifier,
        signer: createScoreSigner(TEST_KEY),
        now: () => 1_000_000,
      });
      const start = await request(frozenApp)
        .post('/api/session/start')
        .send({ walletAddress: PLAYER, tournamentId: 1, entryTxHash: txHash(77) });
      const sessionId = start.body.sessionId as Hex;

      const directions = ['RIGHT', 'DOWN', 'LEFT', 'UP'] as const;
      for (let i = 0; i < 20; i++) {
        const res = await request(frozenApp)
          .post('/api/session/move')
          .send({ sessionId, direction: directions[i % 4] });
        expect(res.status).toBe(200);
      }

      const rejected = await request(frozenApp)
        .post('/api/session/move')
        .send({ sessionId, direction: 'RIGHT' });
      expect(rejected.status).toBe(429);
      expect(rejected.body.error).toBe('RATE_LIMITED');
      expect(rejected.body.state.cheatFlags).toContain('MOVE_RATE_EXCEEDED');
    });

    it('409s with GAME_OVER once the snake is dead', async () => {
      const { sessionId } = await startSession();
      await killSnake(sessionId);
      const res = await request(app).post('/api/session/move').send({ sessionId, direction: 'UP' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('GAME_OVER');
      expect(res.body.state.alive).toBe(false);
    });
  });

  describe('POST /api/session/powerup', () => {
    it('verifies payment and activates the power-up', async () => {
      const { sessionId } = await startSession();
      const res = await request(app)
        .post('/api/session/powerup')
        .send({ sessionId, powerUpType: 'shield', txHash: txHash(50) });

      expect(res.status).toBe(200);
      expect(res.body.state.shield).toBe(true);
      expect(verifier.verifyPowerUpPurchase).toHaveBeenCalledWith({
        txHash: txHash(50),
        walletAddress: PLAYER,
        sessionId,
        powerUpType: 'shield',
      });
    });

    it('a payment tx activates exactly one power-up', async () => {
      const { sessionId } = await startSession();
      await request(app)
        .post('/api/session/powerup')
        .send({ sessionId, powerUpType: 'slowmo', txHash: txHash(51) });

      const res = await request(app)
        .post('/api/session/powerup')
        .send({ sessionId, powerUpType: 'multiplier_2x', txHash: txHash(51) });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('TX_ALREADY_USED');
    });

    it('releases the tx when verification fails so it can retry', async () => {
      const { sessionId } = await startSession();
      powerUpResult = { ok: false, reason: 'Transaction not found or not yet confirmed' };
      const failed = await request(app)
        .post('/api/session/powerup')
        .send({ sessionId, powerUpType: 'multiplier_2x', txHash: txHash(52) });
      expect(failed.status).toBe(400);
      expect(failed.body.error).toBe('POWERUP_VERIFICATION_FAILED');

      powerUpResult = { ok: true };
      const retried = await request(app)
        .post('/api/session/powerup')
        .send({ sessionId, powerUpType: 'multiplier_2x', txHash: txHash(52) });
      expect(retried.status).toBe(200);
      expect(retried.body.state.multiplier).toBe(2);
    });

    it('rejects power-ups that do not apply to the current state', async () => {
      const { sessionId } = await startSession();
      const res = await request(app)
        .post('/api/session/powerup')
        .send({ sessionId, powerUpType: 'revive', txHash: txHash(53) });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('POWERUP_NOT_APPLICABLE');
    });
  });

  describe('POST /api/session/end', () => {
    it('refuses to sign while the game is alive', async () => {
      const { sessionId } = await startSession();
      const res = await request(app).post('/api/session/end').send({ sessionId });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('GAME_NOT_OVER');
    });

    it('signs the final score after death; the contract can verify it', async () => {
      const { sessionId } = await startSession();
      await killSnake(sessionId);

      const res = await request(app).post('/api/session/end').send({ sessionId });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        tournamentId: 1,
        walletAddress: PLAYER,
        score: 0,
        contractAddress: ARENA,
        chainId: 84532,
      });
      expect(res.body.nonce).toMatch(/^0x[0-9a-f]{64}$/);
      expect(res.body.signature).toMatch(/^0x[0-9a-f]{130}$/i);

      // Recover exactly the way SnakeArena.submitScore does on-chain.
      const recovered = await recoverMessageAddress({
        message: {
          raw: buildScoreDigest({
            tournamentId: 1n,
            player: PLAYER,
            score: 0n,
            nonce: res.body.nonce,
            contractAddress: ARENA,
            chainId: 84532n,
          }),
        },
        signature: res.body.signature,
      });
      expect(recovered).toBe(privateKeyToAccount(TEST_KEY).address);
    });

    it('is idempotent: one run signs one (score, nonce) pair', async () => {
      const { sessionId } = await startSession();
      await killSnake(sessionId);

      const first = await request(app).post('/api/session/end').send({ sessionId });
      const second = await request(app).post('/api/session/end').send({ sessionId });
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
    });
  });

  it('404s unknown routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
  });
});
