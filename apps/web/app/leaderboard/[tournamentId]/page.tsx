'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useLeaderboard, type LeaderboardRow } from '@/hooks/useLeaderboard';
import {
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
  prizeBreakdown,
} from '@/lib/contracts';
import { formatUsdc, timeAgo, truncateAddress } from '@/lib/format';
import { Countdown } from '@/components/Countdown';
import { EntryFlow } from '@/components/EntryFlow';
import { TierIcon } from '@/components/illustrations/TierIcon';

const TOP_N_SHOWN = 10;

const RANK_BADGE: Record<number, string> = {
  1: 'border-gold/40 bg-gold/15 text-gold',
  2: 'border-silver/30 bg-silver/10 text-silver',
  3: 'border-bronze/40 bg-bronze/15 text-bronze',
};

/** Payout chips: gold / silver / bronze by position. */
const CHIP_STYLE = [
  'border-gold/40 bg-gold/10 text-gold',
  'border-silver/30 bg-silver/10 text-silver',
  'border-bronze/40 bg-bronze/10 text-bronze',
];

function Row({ row, isUser }: { row: LeaderboardRow; isUser: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-3 px-4 py-3 text-sm ${isUser ? 'bg-accent/[0.07]' : ''}`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular-nums ${
          RANK_BADGE[row.rank] ?? 'border-edge text-muted'
        }`}
      >
        {row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {row.username ?? truncateAddress(row.wallet)}
        {isUser && (
          <span className="ml-2 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-background">
            You
          </span>
        )}
      </span>
      <span className="hidden text-xs tabular-nums text-muted sm:block">
        {row.entryCount.toString()} {row.entryCount === 1n ? 'entry' : 'entries'}
      </span>
      <span className="hidden w-20 text-right text-xs text-muted sm:block">
        {row.lastSubmissionTime > 0n ? timeAgo(Number(row.lastSubmissionTime)) : '—'}
      </span>
      {/* Re-keying on the score pulses it when a better run lands. */}
      <motion.span
        key={row.bestScore.toString()}
        initial={{ scale: 1.25, color: '#2dd4bf' }}
        animate={{ scale: 1, color: '#ffffff' }}
        transition={{ duration: 0.45 }}
        className="w-16 text-right font-mono font-semibold tabular-nums"
      >
        {row.bestScore.toString()}
      </motion.span>
    </motion.div>
  );
}

export default function LeaderboardPage({ params }: { params: { tournamentId: string } }) {
  const valid = /^\d{1,18}$/.test(params.tournamentId);
  const tournamentId = valid ? BigInt(params.tournamentId) : 0n;

  const { address } = useAccount();
  const { tournament, rows, userRank, userRow, isLoading } = useLeaderboard(tournamentId);
  const [entryOpen, setEntryOpen] = useState(false);

  // sessionStorage is browser-only — resolve the unused-entry hint post-mount
  // to keep server and client markup identical.
  const [hasUnusedEntry, setHasUnusedEntry] = useState(false);
  useEffect(() => {
    try {
      setHasUnusedEntry(
        Boolean(sessionStorage.getItem(`snakearena:entryTx:${params.tournamentId}`)),
      );
    } catch {
      setHasUnusedEntry(false);
    }
  }, [params.tournamentId]);

  if (!valid) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted">Invalid tournament id.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent hover:text-accent-hover">
          ← Back to lobby
        </Link>
      </main>
    );
  }

  const tierId = tournament ? TOURNAMENT_TIER_IDS[tournament.tier] : undefined;
  const top = rows.slice(0, TOP_N_SHOWN);
  const breakdown = tournament
    ? prizeBreakdown(tournament.prizePool, tournament.players.length)
    : [];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] sm:py-8">
      <Link
        href="/"
        className="inline-flex min-h-10 items-center text-sm text-muted transition-colors hover:text-white"
      >
        ← Lobby
      </Link>

      {/* Tournament header */}
      <div className="mt-2 overflow-hidden rounded-card border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg">
            {tierId && <TierIcon tierId={tierId} size={24} className="shrink-0" />}
            <span>
              {tierId ? TOURNAMENT_TIERS[tierId].label : 'Tournament'}{' '}
              <span className="font-normal text-muted">#{params.tournamentId}</span>
            </span>
          </h1>
          {tournament && (
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                Ends in
              </p>
              <Countdown
                endTime={tournament.endTime}
                format="clock"
                className="text-base font-semibold"
              />
            </div>
          )}
        </div>

        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Prize pool
        </p>
        {tournament ? (
          <p className="text-gradient-teal mt-1 font-mono text-4xl font-bold tabular-nums leading-none">
            {formatUsdc(tournament.prizePool)}
          </p>
        ) : (
          <div className="skeleton mt-2 h-9 w-36" />
        )}

        {tournament && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {breakdown.map((part, index) => (
              <span
                key={part.label}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                  CHIP_STYLE[index] ?? 'border-edge text-muted'
                }`}
              >
                {part.label} · {formatUsdc(part.amount)}
              </span>
            ))}
            <span className="text-xs tabular-nums text-muted">
              {tournament.players.length} player{tournament.players.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      {/* Rankings */}
      <section className="mt-4 overflow-hidden rounded-card border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Top {TOP_N_SHOWN}
          </h2>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" aria-hidden />
            live
          </span>
        </div>

        <div className="divide-y divide-edge">
          {isLoading && (
            <div className="space-y-2.5 p-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="skeleton h-9 w-full" />
              ))}
            </div>
          )}
          {!isLoading && top.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">
              No scores yet — be the first on the board 🐍
            </p>
          )}
          <AnimatePresence initial={false}>
            {top.map((row) => (
              <Row
                key={row.wallet}
                row={row}
                isUser={Boolean(address && row.wallet.toLowerCase() === address.toLowerCase())}
              />
            ))}
          </AnimatePresence>
        </div>

        {userRow && userRank !== null && userRank > TOP_N_SHOWN && (
          <p className="border-t border-edge bg-accent/[0.07] px-4 py-3 text-sm">
            You: <span className="font-mono font-semibold tabular-nums">#{userRank}</span> with{' '}
            <span className="font-mono tabular-nums">{userRow.bestScore.toString()}</span> points
          </p>
        )}
      </section>

      {/* CTA */}
      {tournament && tierId && (
        <div className="mt-4">
          {hasUnusedEntry ? (
            <Link
              href={`/play/${params.tournamentId}`}
              className="bg-gradient-hero flex min-h-12 w-full items-center justify-center gap-1.5 rounded-btn text-sm font-bold text-background shadow-glow transition-opacity hover:opacity-90"
            >
              <span aria-hidden>▶</span> Play Now — you have an unused entry
            </Link>
          ) : (
            <button
              onClick={() => setEntryOpen(true)}
              className="flex min-h-12 w-full items-center justify-center rounded-btn bg-accent text-sm font-bold text-background transition-all hover:bg-accent-hover hover:shadow-glow"
            >
              {userRow
                ? `Enter Another ${formatUsdc(tournament.entryFee)}`
                : `Enter ${formatUsdc(tournament.entryFee)}`}
            </button>
          )}
          <p className="mt-2 text-center text-xs text-muted">
            Each entry is one run — only your best score counts.
          </p>
        </div>
      )}

      {entryOpen && tournament && tierId && (
        <EntryFlow tierId={tierId} tournament={tournament} onClose={() => setEntryOpen(false)} />
      )}
    </main>
  );
}
