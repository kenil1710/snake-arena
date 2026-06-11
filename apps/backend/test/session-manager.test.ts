import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Address, Hex } from 'viem';
import {
  EntryAlreadyUsedError,
  SESSION_TTL_MS,
  SessionManager,
} from '../src/session/manager.js';

const WALLET = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;

function txHash(n: number): Hex {
  return `0x${n.toString(16).padStart(64, '0')}` as Hex;
}

function entryParams(n = 1) {
  return { walletAddress: WALLET, tournamentId: 1, entryTxHash: txHash(n) };
}

describe('SessionManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates sessions with a bytes32 id, a seeded game, and timestamps', () => {
    let now = 5_000;
    const manager = new SessionManager({ now: () => now });
    const session = manager.createSession(entryParams());

    expect(session.id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(session.walletAddress).toBe(WALLET);
    expect(session.tournamentId).toBe(1);
    expect(typeof session.seed).toBe('number');
    expect(session.game.serialize(0).alive).toBe(true);
    expect(session.createdAt).toBe(5_000);

    now = 6_000;
    expect(manager.getSession(session.id)?.lastActivity).toBe(6_000);
    expect(manager.size).toBe(1);
  });

  it('one entry transaction buys exactly one session (case-insensitive)', () => {
    const manager = new SessionManager();
    manager.createSession(entryParams(0xabc));
    expect(() => manager.createSession(entryParams(0xabc))).toThrow(EntryAlreadyUsedError);
    expect(manager.hasEntryBeenUsed(txHash(0xabc).toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('expires sessions 10 minutes after creation, regardless of activity', () => {
    let now = 0;
    const manager = new SessionManager({ now: () => now });
    const session = manager.createSession(entryParams());

    now = SESSION_TTL_MS - 1;
    expect(manager.getSession(session.id)).toBeDefined();

    now = SESSION_TTL_MS;
    expect(manager.getSession(session.id)).toBeUndefined();
    expect(manager.size).toBe(0);
  });

  it('cleanupExpiredSessions sweeps everything past the TTL', () => {
    let now = 0;
    const manager = new SessionManager({ now: () => now });
    manager.createSession(entryParams(1));
    manager.createSession(entryParams(2));
    now = 60_000;
    manager.createSession(entryParams(3)); // younger session survives

    now = SESSION_TTL_MS + 1;
    expect(manager.cleanupExpiredSessions()).toBe(2);
    expect(manager.size).toBe(1);
  });

  it('runs cleanup on an interval', () => {
    vi.useFakeTimers();
    const manager = new SessionManager();
    manager.createSession(entryParams());
    manager.startCleanup(60_000);

    vi.advanceTimersByTime(SESSION_TTL_MS + 60_000);
    expect(manager.size).toBe(0);
    manager.stopCleanup();
  });

  it('power-up payment txs are single-use until released', () => {
    const manager = new SessionManager();
    expect(manager.markPowerUpTxUsed(txHash(9))).toBe(true);
    expect(manager.markPowerUpTxUsed(txHash(9))).toBe(false);
    manager.releasePowerUpTx(txHash(9));
    expect(manager.markPowerUpTxUsed(txHash(9))).toBe(true);
  });
});
