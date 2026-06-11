import { randomBytes } from 'node:crypto';
import type { Address, Hex } from 'viem';
import { SnakeGame } from '../game-engine/snake.js';
import { randomSeed } from '../game-engine/rng.js';
import { log } from '../log.js';

/** Hard cap per game: a session older than this is dead regardless of activity. */
export const SESSION_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;

export interface SignedScoreResult {
  tournamentId: number;
  walletAddress: Address;
  score: number;
  nonce: Hex;
  signature: Hex;
  contractAddress: Address;
  chainId: number;
}

export interface GameSession {
  /** bytes32 hex — doubles as the on-chain `sessionId` in PowerUpStore purchases. */
  id: Hex;
  walletAddress: Address;
  tournamentId: number;
  entryTxHash: Hex;
  seed: number;
  game: SnakeGame;
  createdAt: number;
  lastActivity: number;
  /** Cached /end result so repeated calls are idempotent (one nonce per run). */
  signedResult?: SignedScoreResult;
}

export class EntryAlreadyUsedError extends Error {
  constructor(txHash: string) {
    super(`Entry transaction already used for a session: ${txHash}`);
    this.name = 'EntryAlreadyUsedError';
  }
}

export interface SessionManagerOptions {
  ttlMs?: number;
  /** Injectable clock for tests. */
  now?: () => number;
}

/**
 * In-memory session store. One paid tournament entry (tx hash) buys exactly one
 * session; power-up payment txs are likewise single-use. State does not survive
 * a process restart — sessions in flight are lost (players keep their on-chain
 * entry; the Supabase-backed persistence arrives in a later phase).
 */
export class SessionManager {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private sessions = new Map<Hex, GameSession>();
  private usedEntryTxs = new Set<string>();
  private usedPowerUpTxs = new Set<string>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(options: SessionManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? SESSION_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  createSession(params: {
    walletAddress: Address;
    tournamentId: number;
    entryTxHash: Hex;
  }): GameSession {
    const entryKey = params.entryTxHash.toLowerCase();
    if (this.usedEntryTxs.has(entryKey)) throw new EntryAlreadyUsedError(params.entryTxHash);
    this.usedEntryTxs.add(entryKey);

    const seed = randomSeed();
    const timestamp = this.now();
    const session: GameSession = {
      id: `0x${randomBytes(32).toString('hex')}` as Hex,
      walletAddress: params.walletAddress,
      tournamentId: params.tournamentId,
      entryTxHash: params.entryTxHash,
      seed,
      game: new SnakeGame({ seed }),
      createdAt: timestamp,
      lastActivity: timestamp,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  /** Returns the session if it exists and hasn't exceeded its 10-minute lifetime. */
  getSession(sessionId: Hex): GameSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    if (this.isExpired(session)) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    session.lastActivity = this.now();
    return session;
  }

  hasEntryBeenUsed(entryTxHash: string): boolean {
    return this.usedEntryTxs.has(entryTxHash.toLowerCase());
  }

  /**
   * Atomically marks a power-up payment tx as consumed. Returns false if it was
   * already used (the purchase must not activate twice).
   */
  markPowerUpTxUsed(txHash: string): boolean {
    const key = txHash.toLowerCase();
    if (this.usedPowerUpTxs.has(key)) return false;
    this.usedPowerUpTxs.add(key);
    return true;
  }

  /** Reverses markPowerUpTxUsed when verification/activation fails after the claim. */
  releasePowerUpTx(txHash: string): void {
    this.usedPowerUpTxs.delete(txHash.toLowerCase());
  }

  cleanupExpiredSessions(): number {
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (this.isExpired(session)) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  startCleanup(intervalMs: number = DEFAULT_CLEANUP_INTERVAL_MS): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const removed = this.cleanupExpiredSessions();
      if (removed > 0) log('session cleanup', { removed, active: this.sessions.size });
    }, intervalMs);
    // Don't keep the process alive just for cleanup.
    this.cleanupTimer.unref?.();
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  get size(): number {
    return this.sessions.size;
  }

  private isExpired(session: GameSession): boolean {
    return this.now() - session.createdAt >= this.ttlMs;
  }
}
