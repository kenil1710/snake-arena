'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAccount } from 'wagmi';
import { Play, Trophy, Zap } from 'lucide-react';
import {
  TIER_META,
  TOURNAMENT_TIERS,
  type ActiveTournament,
  type TournamentTierId,
} from '@/lib/contracts';
import { formatUsdc } from '@/lib/format';
import { hasUnplayedEntry } from '@/lib/entriesUsed';
import { fadeUp, springFast } from '@/lib/animations';
import { Bush } from '@/components/illustrations/Bush';
import { Countdown } from './Countdown';

const ENDING_SOON_S = 5 * 60;

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
  /** Wallet connected? Drives the CTA copy for visitors. */
  connected: boolean;
  onEnter: () => void;
}

/** Seconds until endTime, ticking — drives the "ending soon" treatment. */
function useSecondsLeft(endTime: bigint | undefined): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  if (endTime === undefined || now === null) return null;
  return Number(endTime) - now;
}

/** The level-select coin: price in the tier color, Baloo 2, optional lightning. */
function CoinBadge({ tierId }: { tierId: TournamentTierId }) {
  const meta = TIER_META[tierId];
  const price = `$${TOURNAMENT_TIERS[tierId].entryFeeUsdc}`;
  return (
    <span className="relative shrink-0">
      <span
        className="font-display flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold tabular-nums shadow-[inset_0_2px_0_rgba(255,255,255,0.4),0_4px_12px_rgba(3,18,15,0.5)]"
        style={{ backgroundColor: meta.coinBg, color: meta.coinFg }}
      >
        {price}
      </span>
      {meta.lightning && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background">
          <Zap size={10} className="text-coin" fill="currentColor" aria-hidden />
        </span>
      )}
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-card border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <div className="skeleton h-11 w-11 rounded-full" />
        <div className="skeleton h-5 w-28" />
      </div>
      <div className="skeleton mt-6 h-10 w-32" />
      <div className="skeleton mt-3 h-4 w-44" />
      <div className="skeleton mt-6 h-12 w-full rounded-full" />
    </div>
  );
}

export function TournamentCard({
  tierId,
  tournament,
  entryCount,
  top3,
  connected,
  onEnter,
}: TournamentCardProps) {
  const router = useRouter();
  const { address } = useAccount();
  const config = TOURNAMENT_TIERS[tierId];
  const meta = TIER_META[tierId];
  const entered = (entryCount ?? 0n) > 0n;
  const leader = top3[0];
  const hourly = config.durationHours === 1;
  const secondsLeft = useSecondsLeft(tournament?.endTime);
  const endingSoon = secondsLeft !== null && secondsLeft > 0 && secondsLeft < ENDING_SOON_S;
  const playerCount = tournament?.players.length ?? 0;

  if (!tournament) return <CardSkeleton />;

  const idPath = tournament.id.toString();
  const openLeaderboard = () => router.push(`/leaderboard/${idPath}`);
  // Entered players with an unplayed entry jump straight into a run; once those
  // are used up, "Play" opens the entry flow to buy another attempt inline.
  const handlePlay = () => {
    if (hasUnplayedEntry(address, idPath, entryCount)) router.push(`/play/${idPath}`);
    else onEnter();
  };

  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ rotateX: 2, y: -3 }}
      whileTap={{ scale: 0.97 }}
      transition={springFast}
      style={{ transformPerspective: 900 }}
      onClick={openLeaderboard}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-card border bg-surface p-5 pt-6 shadow-card transition-[border-color,box-shadow] duration-200 hover:shadow-card-hover sm:p-6 sm:pt-7 ${
        endingSoon ? 'animate-pulse border-berry/70' : 'hover:border-edge-bright'
      }`}
    >
      {/* Mint wash on hover */}
      <span
        aria-hidden
        className="card-hover-glow pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      {/* A little bush peeking from the corner */}
      <Bush
        variant="front"
        size={130}
        className="pointer-events-none absolute -bottom-7 -right-5 opacity-30"
      />

      {/* Header: coin badge + name */}
      <div className="relative flex items-start gap-3">
        <CoinBadge tierId={tierId} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold tracking-tight">{meta.displayName}</span>
            {endingSoon ? (
              <span className="rounded-full border border-berry/50 bg-berry/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-berry">
                Ending soon
              </span>
            ) : (
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
                  hourly ? 'border-coin/40 bg-coin/10 text-coin' : 'border-edge text-muted'
                }`}
              >
                {hourly ? 'Hourly' : 'Daily'}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-muted">{meta.tagline}</p>
        </div>
      </div>

      {/* Prize pool — the centerpiece */}
      <p className="relative mt-5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
        Prize pool
      </p>
      <p className="text-glow-prize relative mt-1 font-mono text-4xl font-bold tabular-nums leading-none text-accent-bright">
        {formatUsdc(tournament.prizePool)}
      </p>

      {/* One stat line */}
      <div className="relative mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="animate-live-dot inline-flex h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
          <span className="tabular-nums">
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </span>
        </span>
        <span className="text-muted">·</span>
        <span className="inline-flex items-center gap-1">
          <Countdown endTime={tournament.endTime} className="text-[13px]" />
          <span className="text-muted">left</span>
        </span>
        {entered && (
          <>
            <span className="text-muted">·</span>
            <span className="tabular-nums text-accent">
              {entryCount!.toString()} {entryCount === 1n ? 'entry' : 'entries'}
            </span>
          </>
        )}
      </div>

      {/* Current leader */}
      {leader && (
        <div className="bg-gradient-gold relative mt-3 rounded-btn border border-coin/25 px-3 py-2.5">
          <p className="text-[9px] font-bold uppercase leading-none tracking-[0.18em] text-coin/80">
            Current leader
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-[13px] leading-none">
            <Trophy size={14} className="shrink-0 text-coin" aria-hidden />
            <span className="min-w-0 truncate font-medium">{leader.name}</span>
            <span className="font-display ml-auto shrink-0 font-bold tabular-nums text-coin">
              {leader.score.toString()} PTS
            </span>
          </div>
        </div>
      )}

      {/* CTA row — entered players get Play + Leaderboard side by side */}
      <div className="relative mt-5 flex gap-2.5" onClick={(event) => event.stopPropagation()}>
        {entered ? (
          <>
            <button
              onClick={handlePlay}
              className="font-display flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-edge-bright text-sm font-bold text-background shadow-[0_0_16px_rgba(45,212,191,0.3)] transition-[transform,box-shadow] hover:shadow-[0_0_22px_rgba(45,212,191,0.45)] active:scale-95"
            >
              <Play size={15} fill="currentColor" aria-hidden /> Play
            </button>
            <button
              onClick={openLeaderboard}
              className="font-display flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-accent/40 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-accent/10 active:scale-95"
            >
              <Trophy size={15} aria-hidden /> Leaderboard
            </button>
          </>
        ) : (
          <button
            onClick={onEnter}
            className={`font-display flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-[transform,box-shadow] active:scale-95 ${
              connected
                ? 'btn-sheen text-coin-text hover:shadow-glow'
                : 'border border-edge bg-surface-elevated text-secondary hover:border-accent/50 hover:text-white'
            }`}
          >
            {connected ? (
              <>
                <Play size={15} fill="currentColor" aria-hidden />
                Enter {formatUsdc(tournament.entryFee)}
              </>
            ) : (
              'Connect to enter'
            )}
          </button>
        )}
      </div>

      {top3.length > 1 && (
        <p className="relative mt-3 truncate text-xs text-muted">
          {top3.map((player, index) => `${['🥇', '🥈', '🥉'][index]} ${player.name}`).join('   ')}
        </p>
      )}
    </motion.div>
  );
}
