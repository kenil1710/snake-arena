'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { formatUsdc, truncateAddress } from '@/lib/format';
import { Countdown } from '@/components/Countdown';

const TOP_N = 10;

const RANK_BADGE: Record<number, string> = {
  1: 'bg-gold/15 text-gold border-gold/40',
  2: 'bg-silver/10 text-silver border-silver/30',
  3: 'bg-bronze/15 text-bronze border-bronze/40',
};

interface LiveLeaderboardPanelProps {
  tournamentId: number;
  /** Show the tournament info header (pool + countdown) above the rows. */
  withInfo?: boolean;
}

/**
 * Compact live ranking used inside the play page — desktop sidebar and the
 * mobile expandable section both render this.
 */
export function LiveLeaderboardPanel({ tournamentId, withInfo = false }: LiveLeaderboardPanelProps) {
  const { address } = useAccount();
  const { tournament, rows, userRank, userRow, isLoading } = useLeaderboard(BigInt(tournamentId));
  const top = rows.slice(0, TOP_N);

  return (
    <div className="overflow-hidden rounded-card border bg-surface shadow-card">
      {withInfo && tournament && (
        <div className="flex items-center justify-between gap-3 border-b bg-surface-elevated px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Prize pool
            </p>
            <p className="text-gradient-teal font-mono text-xl font-bold tabular-nums">
              {formatUsdc(tournament.prizePool)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Ends in
            </p>
            <Countdown endTime={tournament.endTime} format="clock" className="text-base font-semibold" />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Leaderboard
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" aria-hidden />
          live
        </span>
      </div>

      <div className="divide-y divide-edge border-t">
        {isLoading && (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-8 w-full" />
            ))}
          </div>
        )}
        {!isLoading && top.length === 0 && (
          <p className="px-4 py-7 text-center text-sm text-muted">
            No scores yet. Be the first 🐍
          </p>
        )}
        <AnimatePresence initial={false}>
          {top.map((row) => {
            const isUser = Boolean(address && row.wallet.toLowerCase() === address.toLowerCase());
            return (
              <motion.div
                key={row.wallet}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-[13px] ${
                  isUser ? 'bg-accent/[0.07]' : ''
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold tabular-nums ${
                    RANK_BADGE[row.rank] ?? 'border-edge text-muted'
                  }`}
                >
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {row.username ?? truncateAddress(row.wallet)}
                </span>
                {isUser && (
                  <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-background">
                    You
                  </span>
                )}
                {/* Re-keying pulses the score when a better run lands. */}
                <motion.span
                  key={row.bestScore.toString()}
                  initial={{ scale: 1.2, color: '#9FE1CB' }}
                  animate={{ scale: 1, color: '#ffffff' }}
                  transition={{ duration: 0.45 }}
                  className="font-mono font-semibold tabular-nums"
                >
                  {row.bestScore.toString()}
                </motion.span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {userRow && userRank !== null && userRank > TOP_N && (
        <p className="border-t bg-accent/[0.07] px-4 py-2.5 text-[13px]">
          You: <span className="font-mono font-semibold tabular-nums">#{userRank}</span> ·{' '}
          <span className="font-mono tabular-nums">{userRow.bestScore.toString()}</span> pts
        </p>
      )}
    </div>
  );
}
