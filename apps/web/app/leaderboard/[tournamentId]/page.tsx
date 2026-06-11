'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useLeaderboard, type LeaderboardRow } from '@/hooks/useLeaderboard';
import {
  TIER_META,
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
  prizeBreakdown,
} from '@/lib/contracts';
import { formatUsdc, timeAgo, truncateAddress } from '@/lib/format';
import { Countdown } from '@/components/Countdown';
import { EntryFlow } from '@/components/EntryFlow';

const TOP_N_SHOWN = 10;

const RANK_COLORS: Record<number, string> = {
  1: 'text-[#fbbf24]', // gold
  2: 'text-[#94a3b8]', // silver
  3: 'text-[#a16207]', // bronze
};

function Row({ row, isUser }: { row: LeaderboardRow; isUser: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-3 px-4 py-3 text-sm ${
        isUser ? 'border-l-2 border-accent bg-accent/5' : ''
      }`}
    >
      <span
        className={`w-8 shrink-0 font-semibold tabular-nums ${RANK_COLORS[row.rank] ?? 'text-muted'}`}
      >
        #{row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {row.username ?? truncateAddress(row.wallet)}
        {isUser && <span className="ml-1.5 text-xs text-accent">you</span>}
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
        initial={{ scale: 1.25, color: '#14b8a6' }}
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
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-muted transition-colors hover:text-white">
        ← Lobby
      </Link>

      <div className="mt-4 border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {tierId ? `${TIER_META[tierId].icon} ${TOURNAMENT_TIERS[tierId].label}` : 'Tournament'}{' '}
            <span className="text-muted">#{params.tournamentId}</span>
          </h1>
          {tournament && (
            <span className="text-sm tabular-nums text-muted">
              <Countdown endTime={tournament.endTime} />
            </span>
          )}
        </div>

        <p className="mt-4 text-3xl font-semibold tabular-nums text-accent">
          {tournament ? formatUsdc(tournament.prizePool) : '—'}
        </p>
        <p className="mt-1 text-xs text-muted">
          {breakdown.length > 0
            ? breakdown.map((part) => `${part.label}: ${formatUsdc(part.amount)}`).join(' · ')
            : 'prize pool'}
          {tournament && ` · ${tournament.players.length} player${tournament.players.length === 1 ? '' : 's'}`}
        </p>
      </div>

      <section className="mt-4 border bg-surface">
        <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Top {TOP_N_SHOWN}
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse bg-accent" aria-hidden />
            live
          </span>
        </div>

        <div className="divide-y divide-edge">
          {isLoading && (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading rankings…</p>
          )}
          {!isLoading && top.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No scores yet — be the first on the board.
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
          <p className="border-t border-edge bg-accent/5 px-4 py-3 text-sm">
            You: <span className="font-semibold tabular-nums">#{userRank}</span> with{' '}
            <span className="font-mono tabular-nums">{userRow.bestScore.toString()}</span> points
          </p>
        )}
      </section>

      {tournament && tierId && (
        <div className="mt-4">
          {hasUnusedEntry ? (
            <Link
              href={`/play/${params.tournamentId}`}
              className="block w-full bg-accent py-2.5 text-center text-sm font-semibold text-background transition-colors hover:bg-accent-hover"
            >
              Play Now — you have an unused entry
            </Link>
          ) : (
            <button
              onClick={() => setEntryOpen(true)}
              className="w-full bg-accent py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover"
            >
              {userRow
                ? `Enter Another ${formatUsdc(tournament.entryFee)}`
                : `Enter ${formatUsdc(tournament.entryFee)}`}
            </button>
          )}
        </div>
      )}

      {entryOpen && tournament && tierId && (
        <EntryFlow tierId={tierId} tournament={tournament} onClose={() => setEntryOpen(false)} />
      )}
    </main>
  );
}
