'use client';

import { useRouter } from 'next/navigation';
import {
  TIER_META,
  TOURNAMENT_TIERS,
  type ActiveTournament,
  type TournamentTierId,
} from '@/lib/contracts';
import { formatUsdc } from '@/lib/format';
import { Countdown } from './Countdown';

export interface TopPlayerTeaser {
  name: string;
  score: bigint;
}

interface TournamentCardProps {
  tierId: TournamentTierId;
  tournament: ActiveTournament | undefined;
  /** Caller's entry count in this tournament (undefined when disconnected). */
  entryCount: bigint | undefined;
  /** Top 3 ranked players, best first (empty until someone scores). */
  top3: TopPlayerTeaser[];
  onEnter: () => void;
}

export function TournamentCard({
  tierId,
  tournament,
  entryCount,
  top3,
  onEnter,
}: TournamentCardProps) {
  const router = useRouter();
  const config = TOURNAMENT_TIERS[tierId];
  const meta = TIER_META[tierId];
  const entered = (entryCount ?? 0n) > 0n;
  const leader = top3[0];

  const openLeaderboard = () => {
    if (tournament) router.push(`/leaderboard/${tournament.id.toString()}`);
  };

  return (
    <div
      onClick={openLeaderboard}
      className={`group flex flex-col border bg-surface p-5 transition-colors hover:border-accent/40 ${
        tournament ? 'cursor-pointer' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden>{meta.icon}</span>
            {config.label}
          </p>
          <p className="mt-1 text-xs text-muted">{meta.tagline}</p>
        </div>
        <span className="border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {config.durationHours === 1 ? 'Hourly' : 'Daily'}
        </span>
      </div>

      <p className="mt-5 text-4xl font-semibold tabular-nums text-accent">
        {tournament ? formatUsdc(tournament.prizePool) : '—'}
      </p>
      <p className="text-xs text-muted">prize pool</p>

      <dl className="mt-4 space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted">Ends in</dt>
          <dd>{tournament ? <Countdown endTime={tournament.endTime} /> : '—'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-muted">Players</dt>
          <dd className="tabular-nums">
            {tournament ? (
              <>
                <span className="mr-1 text-accent" aria-hidden>
                  ●
                </span>
                {tournament.players.length} in
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        {leader && (
          <div className="flex items-center justify-between">
            <dt className="text-muted">🏆 Leading</dt>
            <dd className="max-w-[55%] truncate">
              {leader.name} <span className="tabular-nums text-muted">({leader.score.toString()} pts)</span>
            </dd>
          </div>
        )}
        {entryCount !== undefined && (
          <div className="flex items-center justify-between">
            <dt className="text-muted">Your entries</dt>
            <dd className="tabular-nums">
              {entryCount.toString()}
              {entered && <span className="ml-1.5 text-accent">●</span>}
            </dd>
          </div>
        )}
      </dl>

      <button
        onClick={(event) => {
          event.stopPropagation();
          if (entered) openLeaderboard();
          else onEnter();
        }}
        disabled={!tournament}
        className="mt-5 w-full bg-accent py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-muted"
      >
        {!tournament
          ? 'Loading…'
          : entered
            ? 'View Leaderboard'
            : `Enter ${formatUsdc(tournament.entryFee)}`}
      </button>

      {top3.length > 0 && (
        <p className="mt-3 truncate text-xs text-muted">
          Top 3:{' '}
          {top3
            .map((player, index) => `${['🥇', '🥈', '🥉'][index]} ${player.name}`)
            .join('  ')}
        </p>
      )}
    </div>
  );
}
