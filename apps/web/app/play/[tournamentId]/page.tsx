'use client';

import Link from 'next/link';
import { useAccount, useReadContract } from 'wagmi';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
  type ActiveTournament,
} from '@/lib/contracts';
import { formatUsdc } from '@/lib/format';
import { Countdown } from '@/components/Countdown';

export default function PlayPage({ params }: { params: { tournamentId: string } }) {
  const { address } = useAccount();

  let tournamentId: bigint | null = null;
  try {
    tournamentId = BigInt(params.tournamentId);
  } catch {
    tournamentId = null;
  }

  const { data } = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'getTournament',
    args: tournamentId !== null ? [tournamentId] : undefined,
    query: { enabled: tournamentId !== null },
  });
  const tournament = data as unknown as ActiveTournament | undefined;

  const { data: entry } = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'entries',
    args: tournamentId !== null && address ? [tournamentId, address] : undefined,
    query: { enabled: tournamentId !== null && Boolean(address) },
  });
  const entryCount = entry ? (entry as readonly [string, bigint, bigint, bigint])[3] : undefined;

  if (tournamentId === null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted">Invalid tournament id.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent hover:text-accent-hover">
          ← Back to lobby
        </Link>
      </main>
    );
  }

  const tierLabel =
    tournament && TOURNAMENT_TIER_IDS[tournament.tier]
      ? TOURNAMENT_TIERS[TOURNAMENT_TIER_IDS[tournament.tier]].label
      : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-muted transition-colors hover:text-white">
        ← Lobby
      </Link>

      <div className="mt-4 border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {tierLabel ?? 'Tournament'} <span className="text-muted">#{params.tournamentId}</span>
          </h1>
          {tournament && (
            <span className="text-sm text-muted">
              Ends in <Countdown endTime={tournament.endTime} />
            </span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Prize pool</dt>
            <dd className="mt-0.5 tabular-nums text-accent">
              {tournament ? formatUsdc(tournament.prizePool) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Players</dt>
            <dd className="mt-0.5 tabular-nums">{tournament ? tournament.players.length : '—'}</dd>
          </div>
          <div>
            <dt className="text-muted">Your entries</dt>
            <dd className="mt-0.5 tabular-nums">{entryCount?.toString() ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 flex aspect-square w-full flex-col items-center justify-center gap-3 border border-dashed border-edge bg-surface/50 text-center">
        <p className="text-4xl" aria-hidden>
          🐍
        </p>
        <p className="text-sm font-medium">Game canvas coming in Phase 5</p>
        <p className="max-w-xs text-xs text-muted">
          Your entry is locked in on-chain. The playable canvas, power-up bar, and score submission
          land in the next phase.
        </p>
      </div>
    </main>
  );
}
