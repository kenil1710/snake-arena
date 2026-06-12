import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Address, Hex } from 'viem';
import { createApp } from '../src/app.js';
import type { BackendConfig } from '../src/config.js';
import type { ArenaChain, FinalizeResult, TournamentSnapshot } from '../src/chain/arena.js';
import type { ChainVerifier } from '../src/chain/verify.js';
import { createScoreSigner } from '../src/signer/sign.js';
import { SessionManager } from '../src/session/manager.js';
import {
  FINALIZE_GRACE_SECONDS,
  TournamentFinalizer,
  type SweepResult,
} from '../src/cron/tournamentFinalizer.js';
import {
  createHealthMonitor,
  LOW_BALANCE_THRESHOLD_WEI,
  STUCK_THRESHOLD_SECONDS,
} from '../src/cron/healthMonitor.js';
import type { Logger } from '../src/lib/logger.js';

const FINALIZER_WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;

const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

function tournament(overrides: Partial<TournamentSnapshot> & { id: bigint; tier: number }): TournamentSnapshot {
  return { startTime: 0n, endTime: 1_000n, prizePool: 0n, finalized: false, ...overrides };
}

/**
 * In-memory ArenaChain. finalizeTournament mimics the contract: marks the
 * tournament finalized and starts the tier's next one (id + 100).
 */
function createFakeArena(params: { now?: bigint; balance?: bigint; tournaments: TournamentSnapshot[] }) {
  const byId = new Map(params.tournaments.map((t) => [t.id, t]));
  const currentByTier = new Map(params.tournaments.map((t) => [t.tier, t.id]));

  const getBlockTimestamp = vi.fn<ArenaChain['getBlockTimestamp']>(async () => params.now ?? 0n);
  const getCurrentTournamentId = vi.fn<ArenaChain['getCurrentTournamentId']>(
    async (tier) => currentByTier.get(tier) ?? 0n,
  );
  const getTournament = vi.fn<ArenaChain['getTournament']>(async (id) => {
    const found = byId.get(id);
    if (!found) throw new Error(`fake: unknown tournament ${id}`);
    return { ...found };
  });
  const getFinalizerBalance = vi.fn<ArenaChain['getFinalizerBalance']>(
    async () => params.balance ?? 10n ** 18n,
  );
  const finalizeTournament = vi.fn<ArenaChain['finalizeTournament']>(async (id): Promise<FinalizeResult> => {
    const old = byId.get(id);
    if (!old) throw new Error(`fake: unknown tournament ${id}`);
    old.finalized = true;
    const next = tournament({ id: id + 100n, tier: old.tier, endTime: old.endTime + 3_600n });
    byId.set(next.id, next);
    currentByTier.set(next.tier, next.id);
    return {
      txHash: `0x${id.toString(16).padStart(64, '0')}` as Hex,
      winners: [],
      payouts: [],
      nextTournamentId: next.id,
    };
  });

  return {
    finalizerAddress: FINALIZER_WALLET,
    getBlockTimestamp,
    getCurrentTournamentId,
    getTournament,
    getFinalizerBalance,
    finalizeTournament,
  } satisfies ArenaChain;
}

/** Four tiers, all with endTime 1000s except overrides. */
function fourTiers(overrides: Partial<Record<number, Partial<TournamentSnapshot>>> = {}): TournamentSnapshot[] {
  return [0, 1, 2, 3].map((tier) =>
    tournament({ id: BigInt(tier + 1), tier, endTime: 1_000n, ...overrides[tier] }),
  );
}

describe('TournamentFinalizer', () => {
  it('finalizes a tournament once endTime + grace has passed and reports the next one', async () => {
    // Tier 0 hits the grace boundary exactly; the rest are still running.
    const now = 1_000n + FINALIZE_GRACE_SECONDS;
    const arena = createFakeArena({
      now,
      tournaments: fourTiers({ 1: { endTime: 9_999n }, 2: { endTime: 9_999n }, 3: { endTime: 9_999n } }),
    });
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const sweep = await finalizer.checkAndFinalizeAll();

    expect(sweep.ran).toBe(true);
    if (!sweep.ran) return;
    expect(sweep.tiers[0]).toMatchObject({ tier: 0, tournamentId: 1n, action: 'finalized', nextTournamentId: 101n });
    expect(sweep.tiers.slice(1).map((t) => t.action)).toEqual(['active', 'active', 'active']);
    expect(arena.finalizeTournament).toHaveBeenCalledTimes(1);
    expect(arena.finalizeTournament).toHaveBeenCalledWith(1n);
  });

  it('skips tournaments that have not expired', async () => {
    const arena = createFakeArena({ now: 999n, tournaments: fourTiers() });
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const sweep = await finalizer.checkAndFinalizeAll();

    expect(sweep.ran).toBe(true);
    if (!sweep.ran) return;
    expect(sweep.tiers.every((t) => t.action === 'active')).toBe(true);
    expect(arena.finalizeTournament).not.toHaveBeenCalled();
  });

  it('waits out the 30s grace period after endTime before paying out', async () => {
    // Ended 29s ago: still inside the grace window for late score submissions.
    const arena = createFakeArena({ now: 1_000n + FINALIZE_GRACE_SECONDS - 1n, tournaments: fourTiers() });
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const result = await finalizer.checkTier(0, 1_000n + FINALIZE_GRACE_SECONDS - 1n);

    expect(result).toMatchObject({ action: 'grace', secondsUntilFinalize: 1n });
    expect(arena.finalizeTournament).not.toHaveBeenCalled();
  });

  it('per-tournament lock prevents double finalization', async () => {
    const now = 2_000n;
    const arena = createFakeArena({ now, tournaments: fourTiers() });
    let release!: (result: FinalizeResult) => void;
    // Only the first tx hangs; the retry at the end uses the default fake.
    arena.finalizeTournament.mockImplementationOnce(
      () => new Promise<FinalizeResult>((resolve) => (release = resolve)),
    );
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const first = finalizer.checkTier(0, now);
    // Wait until the first call holds the lock (its tx is in flight)...
    await vi.waitFor(() => expect(arena.finalizeTournament).toHaveBeenCalledTimes(1));
    // ...then a concurrent attempt must refuse to send a second tx.
    const second = await finalizer.checkTier(0, now);
    expect(second).toMatchObject({ action: 'locked', tournamentId: 1n });
    expect(arena.finalizeTournament).toHaveBeenCalledTimes(1);

    release({ txHash: '0x01' as Hex, winners: [], payouts: [], nextTournamentId: 101n });
    await expect(first).resolves.toMatchObject({ action: 'finalized' });

    // Lock is released afterwards: a later attempt may try again.
    await finalizer.checkTier(0, now);
    expect(arena.finalizeTournament).toHaveBeenCalledTimes(2);
  });

  it('skips a sweep while the previous one is still running', async () => {
    const arena = createFakeArena({ tournaments: fourTiers() });
    let releaseTime!: (now: bigint) => void;
    arena.getBlockTimestamp.mockImplementation(
      () => new Promise<bigint>((resolve) => (releaseTime = resolve)),
    );
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const first = finalizer.checkAndFinalizeAll();
    const second = await finalizer.checkAndFinalizeAll();
    expect(second).toEqual({ ran: false, reason: 'sweep-in-progress' });

    releaseTime(0n);
    await expect(first).resolves.toMatchObject({ ran: true });

    // Mutex released: the next tick sweeps again.
    arena.getBlockTimestamp.mockResolvedValue(0n);
    await expect(finalizer.checkAndFinalizeAll()).resolves.toMatchObject({ ran: true });
  });

  it('a reverting tier does not block the others', async () => {
    const now = 10_000n; // every tier long expired
    const arena = createFakeArena({ now, tournaments: fourTiers() });
    arena.finalizeTournament.mockImplementationOnce(async () => {
      throw new Error('execution reverted: TournamentAlreadyFinalized()');
    });
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const sweep = await finalizer.checkAndFinalizeAll();

    expect(sweep.ran).toBe(true);
    if (!sweep.ran) return;
    expect(sweep.tiers[0]).toMatchObject({ action: 'error', message: expect.stringContaining('reverted') });
    expect(sweep.tiers.slice(1).every((t) => t.action === 'finalized')).toBe(true);
    expect(arena.finalizeTournament).toHaveBeenCalledTimes(4);
  });

  it('reports an error when a tier has no current tournament', async () => {
    const arena = createFakeArena({ now: 0n, tournaments: [] });
    const finalizer = new TournamentFinalizer({ chain: arena, logger: silentLogger });

    const result = await finalizer.checkTier(2, 0n);

    expect(result).toMatchObject({ tier: 2, tournamentId: 0n, action: 'error' });
  });
});

describe('createHealthMonitor', () => {
  it('reports ok with balances, tiers, and active session count when healthy', async () => {
    const arena = createFakeArena({ now: 500n, tournaments: fourTiers() });
    const monitor = createHealthMonitor({ chain: arena, sessions: { size: 7 }, logger: silentLogger });

    const report = await monitor.runHealthCheck();

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.activeSessions).toBe(7);
    expect(report.finalizerAddress).toBe(FINALIZER_WALLET);
    expect(report.tiers).toHaveLength(4);
    expect(report.tiers.every((t) => t.expiredForSeconds === 0n)).toBe(true);
  });

  it('warns when the finalizer wallet balance drops below the threshold', async () => {
    const arena = createFakeArena({
      now: 500n,
      balance: LOW_BALANCE_THRESHOLD_WEI - 1n,
      tournaments: fourTiers(),
    });
    const monitor = createHealthMonitor({ chain: arena, sessions: { size: 0 }, logger: silentLogger });

    const report = await monitor.runHealthCheck();

    expect(report.issues).toContainEqual({
      level: 'WARN',
      message: expect.stringContaining('low on gas'),
    });
    // Low gas is a warning, not an outage.
    expect(report.ok).toBe(true);
  });

  it('flags a long-expired unfinalized tournament as a stuck finalizer', async () => {
    const arena = createFakeArena({
      now: 1_000n + STUCK_THRESHOLD_SECONDS,
      tournaments: fourTiers({ 1: { endTime: 99_999n }, 2: { endTime: 99_999n }, 3: { endTime: 99_999n } }),
    });
    const monitor = createHealthMonitor({ chain: arena, sessions: { size: 0 }, logger: silentLogger });

    const report = await monitor.runHealthCheck();

    expect(report.ok).toBe(false);
    expect(report.issues).toContainEqual({
      level: 'ERROR',
      message: expect.stringContaining('finalizer appears stuck'),
    });
  });
});

describe('POST /api/admin/finalize-now', () => {
  const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex;
  const baseConfig: BackendConfig = {
    port: 0,
    chainId: 84532,
    rpcUrl: 'http://unused.invalid',
    snakeArenaAddress: '0xd25B8F3dfE7B9C5af8a4eE5aD86543918429D49a' as Address,
    powerUpStoreAddress: '0x115FCF24E31AA3B970aaf4Be27BbB4e45dbc2ec7' as Address,
    usdcAddress: null,
    trustedSignerPrivateKey: TEST_KEY,
    corsOrigins: ['http://localhost:3000'],
    cronEnabled: true,
    finalizerPrivateKey: null,
    adminSecret: 'hunter2',
    discordWebhookUrl: null,
  };
  const verifier: ChainVerifier = {
    verifyEntry: vi.fn(async () => ({ ok: true as const })),
    verifyPowerUpPurchase: vi.fn(async () => ({ ok: true as const })),
  };

  function buildApp(overrides: { adminSecret?: string | null; withFinalizer?: boolean } = {}) {
    const sweep: SweepResult = {
      ran: true,
      tiers: [
        {
          tier: 0,
          tournamentId: 7n,
          action: 'finalized',
          txHash: '0xabc' as Hex,
          winners: [],
          payouts: [9_000_000n],
          nextTournamentId: 8n,
        },
      ],
    };
    const finalizer = { checkAndFinalizeAll: vi.fn(async () => sweep) };
    const app = createApp({
      config: { ...baseConfig, adminSecret: overrides.adminSecret === undefined ? 'hunter2' : overrides.adminSecret },
      sessions: new SessionManager(),
      verifier,
      signer: createScoreSigner(TEST_KEY),
      finalizer: (overrides.withFinalizer ?? true) ? finalizer : null,
    });
    return { app, finalizer };
  }

  it('rejects a missing or wrong secret', async () => {
    const { app, finalizer } = buildApp();
    expect((await request(app).post('/api/admin/finalize-now')).status).toBe(401);
    const wrong = await request(app).post('/api/admin/finalize-now').set('x-admin-secret', 'nope');
    expect(wrong.status).toBe(401);
    expect(finalizer.checkAndFinalizeAll).not.toHaveBeenCalled();
  });

  it('is disabled when ADMIN_SECRET is not configured', async () => {
    const { app } = buildApp({ adminSecret: null });
    const res = await request(app).post('/api/admin/finalize-now').set('x-admin-secret', 'hunter2');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('ADMIN_DISABLED');
  });

  it('triggers a sweep and returns its result with bigints stringified', async () => {
    const { app, finalizer } = buildApp();
    const res = await request(app).post('/api/admin/finalize-now').set('x-admin-secret', 'hunter2');

    expect(res.status).toBe(200);
    expect(finalizer.checkAndFinalizeAll).toHaveBeenCalledTimes(1);
    expect(res.body.ran).toBe(true);
    expect(res.body.tiers[0]).toMatchObject({
      action: 'finalized',
      tournamentId: '7',
      payouts: ['9000000'],
      nextTournamentId: '8',
    });
  });

  it('reports the keeper as unavailable when cron is disabled', async () => {
    const { app } = buildApp({ withFinalizer: false });
    const res = await request(app).post('/api/admin/finalize-now').set('x-admin-secret', 'hunter2');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('CRON_DISABLED');
  });
});
