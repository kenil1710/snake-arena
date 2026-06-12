import { formatEther, type Address } from 'viem';
import type { ArenaChain } from '../chain/arena.js';
import { createLogger, type Logger } from '../lib/logger.js';
import { FINALIZE_GRACE_SECONDS, TIER_COUNT } from './tournamentFinalizer.js';

/** Finalization costs ~0.0001 ETH on Base Sepolia; warn with ~10 txs left. */
export const LOW_BALANCE_THRESHOLD_WEI = 1_000_000_000_000_000n; // 0.001 ETH

/**
 * A tournament expired this long without being finalized means the finalizer
 * is stuck. Must comfortably exceed grace (30s) + cron cadence (60s) +
 * confirmation time, or every check would false-alarm on normal latency.
 */
export const STUCK_THRESHOLD_SECONDS = 300n;

export interface HealthIssue {
  level: 'WARN' | 'ERROR';
  message: string;
}

export interface TierHealth {
  tier: number;
  tournamentId: bigint;
  endTime: bigint;
  /** 0 while the tournament is still running. */
  expiredForSeconds: bigint;
}

export interface HealthReport {
  ok: boolean;
  finalizerAddress: Address;
  balanceWei: bigint;
  activeSessions: number;
  tiers: TierHealth[];
  issues: HealthIssue[];
}

export interface HealthMonitorDeps {
  chain: ArenaChain;
  /** SessionManager satisfies this; narrowed for tests. */
  sessions: { readonly size: number };
  logger?: Logger;
}

export interface HealthMonitor {
  runHealthCheck(): Promise<HealthReport>;
}

/**
 * Periodic ops check: finalizer gas balance, stuck (expired-but-unfinalized)
 * tournaments, and in-memory session pressure. Console-only for now —
 * DISCORD_WEBHOOK_URL alerting is reserved for later.
 */
export function createHealthMonitor(deps: HealthMonitorDeps): HealthMonitor {
  const { chain, sessions } = deps;
  const logger = deps.logger ?? createLogger('cron/health');

  return {
    async runHealthCheck() {
      const issues: HealthIssue[] = [];

      const [balanceWei, now] = await Promise.all([
        chain.getFinalizerBalance(),
        chain.getBlockTimestamp(),
      ]);
      if (balanceWei < LOW_BALANCE_THRESHOLD_WEI) {
        issues.push({
          level: 'WARN',
          message: `finalizer wallet ${chain.finalizerAddress} low on gas: ${formatEther(balanceWei)} ETH (threshold ${formatEther(LOW_BALANCE_THRESHOLD_WEI)} ETH)`,
        });
      }

      const tiers: TierHealth[] = [];
      for (let tier = 0; tier < TIER_COUNT; tier++) {
        const tournamentId = await chain.getCurrentTournamentId(tier);
        if (tournamentId === 0n) {
          issues.push({ level: 'ERROR', message: `tier ${tier} has no current tournament` });
          continue;
        }
        const tournament = await chain.getTournament(tournamentId);
        const expiredForSeconds = now > tournament.endTime ? now - tournament.endTime : 0n;
        tiers.push({ tier, tournamentId, endTime: tournament.endTime, expiredForSeconds });

        if (expiredForSeconds >= STUCK_THRESHOLD_SECONDS) {
          issues.push({
            level: 'ERROR',
            message: `tournament #${tournamentId} (tier ${tier}) expired ${expiredForSeconds}s ago and is not finalized — finalizer appears stuck`,
          });
        } else if (expiredForSeconds > FINALIZE_GRACE_SECONDS) {
          // Normal between cron ticks; worth a trace but not an alarm.
          logger.info(`tournament #${tournamentId} (tier ${tier}) awaiting finalization`, {
            expiredForSeconds,
          });
        }
      }

      const report: HealthReport = {
        ok: !issues.some((issue) => issue.level === 'ERROR'),
        finalizerAddress: chain.finalizerAddress,
        balanceWei,
        activeSessions: sessions.size,
        tiers,
        issues,
      };

      logger.info('health check', {
        ok: report.ok,
        balance: `${formatEther(balanceWei)} ETH`,
        activeSessions: report.activeSessions,
        issues: issues.length,
      });
      for (const issue of issues) {
        if (issue.level === 'ERROR') logger.error(issue.message);
        else logger.warn(issue.message);
      }

      return report;
    },
  };
}
