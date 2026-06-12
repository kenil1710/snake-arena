import { formatUnits, type Address, type Hex } from 'viem';
import type { ArenaChain } from '../chain/arena.js';
import { createLogger, type Logger } from '../lib/logger.js';

/**
 * Seconds past endTime before we finalize. Game sessions straddling endTime
 * still need to land their submitScore tx (the contract accepts scores until
 * finalization), so payouts wait out this grace window.
 */
export const FINALIZE_GRACE_SECONDS = 30n;

/** TournamentTier enum has 4 values (0..3); fixed at deployment. */
export const TIER_COUNT = 4;

export type TierCheckResult =
  | {
      tier: number;
      tournamentId: bigint;
      action: 'finalized';
      txHash: Hex;
      winners: readonly Address[];
      payouts: readonly bigint[];
      nextTournamentId: bigint | null;
    }
  /** Tournament window still open. */
  | { tier: number; tournamentId: bigint; action: 'active'; secondsRemaining: bigint }
  /** Window closed but inside the late-submission grace period. */
  | { tier: number; tournamentId: bigint; action: 'grace'; secondsUntilFinalize: bigint }
  /** Another caller is already finalizing this tournament. */
  | { tier: number; tournamentId: bigint; action: 'locked' }
  | { tier: number; tournamentId: bigint | null; action: 'error'; message: string };

export type SweepResult =
  | { ran: false; reason: 'sweep-in-progress' }
  | { ran: true; tiers: TierCheckResult[] };

export interface TournamentFinalizerDeps {
  chain: ArenaChain;
  logger?: Logger;
}

/**
 * Keeper that watches all four tiers and calls finalizeTournament once a
 * tournament's window (plus grace) has lapsed. The contract pays winners and
 * starts the tier's next tournament in the same transaction, so a single
 * successful call per period keeps a tier alive.
 */
export class TournamentFinalizer {
  private readonly chain: ArenaChain;
  private readonly logger: Logger;
  /** Tournament ids with a finalize tx currently in flight. */
  private readonly inFlight = new Set<bigint>();
  /**
   * Sweep mutex: node-cron fires on schedule even if the previous run hasn't
   * returned, and overlapping sweeps would race the finalizer wallet's nonce.
   */
  private sweeping = false;

  constructor(deps: TournamentFinalizerDeps) {
    this.chain = deps.chain;
    this.logger = deps.logger ?? createLogger('cron/finalizer');
  }

  /** Checks every tier and finalizes the expired ones, sequentially. */
  async checkAndFinalizeAll(): Promise<SweepResult> {
    if (this.sweeping) {
      this.logger.warn('previous sweep still running, skipping this tick');
      return { ran: false, reason: 'sweep-in-progress' };
    }
    this.sweeping = true;
    try {
      this.logger.info('Checking tournaments...');
      const now = await this.chain.getBlockTimestamp();
      const tiers: TierCheckResult[] = [];
      for (let tier = 0; tier < TIER_COUNT; tier++) {
        tiers.push(await this.checkTier(tier, now));
      }
      return { ran: true, tiers };
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * Checks a single tier against on-chain time `now` and finalizes if due.
   * Never throws: failures come back as an 'error' result so one stuck tier
   * can't block the others.
   */
  async checkTier(tier: number, now: bigint): Promise<TierCheckResult> {
    let tournamentId: bigint | null = null;
    try {
      tournamentId = await this.chain.getCurrentTournamentId(tier);
      if (tournamentId === 0n) {
        // Ids start at 1 and the constructor starts every tier, so 0 means a
        // wrong contract address or a never-initialized tier.
        const message = 'no current tournament for tier';
        this.logger.error(message, undefined, { tier });
        return { tier, tournamentId, action: 'error', message };
      }

      const tournament = await this.chain.getTournament(tournamentId);
      if (now < tournament.endTime) {
        return { tier, tournamentId, action: 'active', secondsRemaining: tournament.endTime - now };
      }
      const finalizeAt = tournament.endTime + FINALIZE_GRACE_SECONDS;
      if (now < finalizeAt) {
        this.logger.info(`tournament #${tournamentId} ended, waiting out grace period`, {
          tier,
          secondsUntilFinalize: finalizeAt - now,
        });
        return { tier, tournamentId, action: 'grace', secondsUntilFinalize: finalizeAt - now };
      }

      if (this.inFlight.has(tournamentId)) {
        this.logger.warn(`finalization of tournament #${tournamentId} already in flight, skipping`, { tier });
        return { tier, tournamentId, action: 'locked' };
      }

      this.inFlight.add(tournamentId);
      try {
        this.logger.info(`Finalizing tournament #${tournamentId} (tier ${tier})...`, {
          prizePool: `${formatUnits(tournament.prizePool, 6)} USDC`,
          expiredForSeconds: now - tournament.endTime,
        });
        const result = await this.chain.finalizeTournament(tournamentId);
        this.logger.info(
          `Finalized tournament #${tournamentId} (tier ${tier}), winners: ${
            result.winners.length > 0 ? result.winners.join(', ') : 'none (empty pool)'
          }`,
          {
            txHash: result.txHash,
            payouts: result.payouts.map((p) => `${formatUnits(p, 6)} USDC`),
            nextTournamentId: result.nextTournamentId,
          },
        );
        return { tier, tournamentId, action: 'finalized', ...result };
      } finally {
        this.inFlight.delete(tournamentId);
      }
    } catch (error) {
      // Log and move on — the next sweep retries, and other tiers still run.
      this.logger.error(`failed to finalize tier ${tier}`, error, {
        tournamentId: tournamentId ?? 'unknown',
      });
      return {
        tier,
        tournamentId,
        action: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
