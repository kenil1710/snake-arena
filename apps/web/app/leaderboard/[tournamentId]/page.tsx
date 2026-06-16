'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useLeaderboard, type LeaderboardRow } from '@/hooks/useLeaderboard';
import {
  TIER_META,
  TOURNAMENT_TIER_IDS,
  prizeBreakdown,
} from '@/lib/contracts';
import { formatUsdc, timeAgo, truncateAddress } from '@/lib/format';
import { Countdown } from '@/components/Countdown';
import { EntryFlow } from '@/components/EntryFlow';
import { TierIcon } from '@/components/illustrations/TierIcon';
import { Bush } from '@/components/illustrations/Bush';

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
      className={`flex items-center gap-3 px-4 py-3 text-sm ${isUser ? 'bg-coin/[0.08]' : ''}`}
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
          <span className="ml-2 rounded-full bg-coin px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-coin-text">
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
        initial={{ scale: 1.25, color: '#9FE1CB' }}
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
    <main className="relative mx-auto w-full max-w-2xl px-4 py-6 pb-[max(env(safe-area-inset-bottom),6.5rem)] sm:py-8 md:pb-12">
      {/* Garden scenery at the foot of the board */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 overflow-hidden">
        <Bush variant="back" size={200} className="absolute -bottom-8 -left-10 opacity-[0.13]" />
        <Bush variant="back" size={220} className="absolute -bottom-9 -right-10 opacity-[0.13]" />
      </div>

      <Link
        href="/"
        className="inline-flex min-h-10 items-center text-sm text-muted transition-colors hover:text-white"
      >
        ← Lobby
      </Link>

      {/* Tournament header */}
      <div className="mt-2 overflow-hidden rounded-card border bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg">
            {tierId && <TierIcon tierId={tierId} size={24} className="shrink-0" />}
            <span>
              {tierId ? TIER_META[tierId].displayName : 'Tournament'}{' '}
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

      </section>

      {/* CTA */}
      {tournament && tierId && (
        <div className="mt-4">
          {hasUnusedEntry ? (
            <Link
              href={`/play/${params.tournamentId}`}
              className="btn-sheen font-display flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
            >
              <span aria-hidden>▶</span> Play now — you have an unused entry
            </Link>
          ) : (
            <button
              onClick={() => setEntryOpen(true)}
              className="btn-sheen font-display flex min-h-12 w-full items-center justify-center rounded-full text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
            >
              {userRow
                ? `Enter another ${formatUsdc(tournament.entryFee)}`
                : `Enter ${formatUsdc(tournament.entryFee)}`}
            </button>
          )}
          <p className="mt-2 text-center text-xs text-muted">
            Each entry is one run — only your best score counts.
          </p>
        </div>
      )}

      {/* Sticky your-rank bar when you're below the visible top N */}
      {userRow && userRank !== null && userRank > TOP_N_SHOWN && (
        <div className="sticky bottom-[5.5rem] z-20 mt-4 md:bottom-4">
          <div className="flex items-center justify-between gap-3 rounded-full border border-coin/40 bg-surface/95 px-4 py-2.5 text-sm shadow-[0_8px_24px_rgba(3,18,15,0.6)] backdrop-blur">
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-coin text-[10px] font-bold tabular-nums text-coin-text">
                #{userRank}
              </span>
              <span className="font-semibold">You</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-coin">
              {userRow.bestScore.toString()} pts
            </span>
          </div>
        </div>
      )}

      {entryOpen && tournament && tierId && (
        <EntryFlow tierId={tierId} tournament={tournament} onClose={() => setEntryOpen(false)} />
      )}
    </main>
  );
}
