'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import {
  Coins,
  ExternalLink,
  Gamepad2,
  LogIn,
  Medal,
  Play,
  Target,
  Ticket,
  Trophy,
} from 'lucide-react';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  EXPLORER_URL,
  SNAKE_ARENA_ADDRESS,
  TIER_ENUM_INDEX,
  TIER_META,
  TOURNAMENT_TIER_IDS,
  type ActiveTournament,
  type PlayerEntry,
} from '@/lib/contracts';
import {
  blockTimestamps,
  cachedLogScan,
  ENTERED_TOURNAMENT_EVENT,
  SCORE_SUBMITTED_EVENT,
  TOURNAMENT_FINALIZED_EVENT,
  type EnteredArgs,
  type FinalizedArgs,
  type ScoreArgs,
} from '@/lib/events';
import { formatUsdc, timeAgo, truncateAddress } from '@/lib/format';
import { EmptyState } from '@/components/illustrations/EmptyState';
import { Mascot } from '@/components/illustrations/Mascot';
import { TierIcon } from '@/components/illustrations/TierIcon';
import { IdentityAvatar } from '@/components/ui/IdentityAvatar';

/** Most recent blocks per query whose timestamps we resolve for "2m ago" labels. */
const TIMESTAMPED_ITEMS = 20;
const ACTIVITY_ITEMS = 15;

interface StatBlockProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** Per-stat radial tint behind the number. */
  tint: string;
  loading: boolean;
}

function StatBlock({ label, value, icon, tint, loading }: StatBlockProps) {
  return (
    <div className="relative overflow-hidden rounded-card border bg-surface px-4 py-4 shadow-card sm:px-5">
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: tint }} />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
        {icon}
      </div>
      {loading ? (
        <div className="skeleton relative mt-2.5 h-8 w-24" />
      ) : (
        <p className="relative mt-2 font-mono text-[26px] font-bold tabular-nums leading-none sm:text-[32px]">
          {value}
        </p>
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{title}</h2>
      <div className="mt-2.5 divide-y divide-edge overflow-hidden rounded-card border bg-surface shadow-card">
        {children}
      </div>
    </section>
  );
}

const RANK_BADGE: Record<number, string> = {
  1: 'border-gold/40 bg-gold/15 text-gold',
  2: 'border-silver/30 bg-silver/10 text-silver',
  3: 'border-bronze/40 bg-bronze/15 text-bronze',
};

const MEDAL_COLOR: Record<number, string> = {
  1: 'text-gold',
  2: 'text-silver',
  3: 'text-bronze',
};

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();

  const usernameRead = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'usernames',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const username = (usernameRead.data as string | undefined) || null;

  // Full on-chain history for this wallet. cachedLogScan walks the chain in
  // RPC-safe 9k-block chunks and persists to localStorage, so after the first
  // visit only freshly mined blocks are fetched.
  const history = useQuery({
    queryKey: ['profile-history', address],
    enabled: Boolean(address) && Boolean(client),
    refetchInterval: 15_000,
    queryFn: async () => {
      const common = { args: { player: address } } as const;
      const [enteredScan, scoresScan] = await Promise.all([
        cachedLogScan<EnteredArgs>({
          ...common,
          event: ENTERED_TOURNAMENT_EVENT,
          cacheKey: `entered:${address!.toLowerCase()}`,
        }),
        cachedLogScan<ScoreArgs>({
          ...common,
          event: SCORE_SUBMITTED_EVENT,
          cacheKey: `scores:${address!.toLowerCase()}`,
        }),
      ]);
      const entered = enteredScan.logs;
      const scores = scoresScan.logs;
      // Either scan hitting a chunk failure means the feed is incomplete.
      const partial = !enteredScan.complete || !scoresScan.complete;
      const recentBlocks = [...entered, ...scores]
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, TIMESTAMPED_ITEMS)
        .map((log) => log.blockNumber);
      const timestamps = await blockTimestamps(client!, recentBlocks);
      return { entered, scores, timestamps, partial };
    },
  });

  const distinctIds = [
    ...new Set((history.data?.entered ?? []).map((log) => log.args.tournamentId)),
  ];

  // Resolve each tournament's tier + entry fee to price the entries.
  const tournamentReads = useReadContracts({
    contracts: distinctIds.map(
      (id) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'tournaments',
          args: [id],
        }) as const,
    ),
    query: { enabled: distinctIds.length > 0 },
  });

  const tournamentInfo = new Map<bigint, { tier: number; entryFee: bigint }>();
  distinctIds.forEach((id, index) => {
    const read = tournamentReads.data?.[index];
    if (read?.status === 'success') {
      // tournaments() tuple: [id, tier, startTime, endTime, prizePool, entryFee, finalized]
      const tuple = read.result as readonly [bigint, number, bigint, bigint, bigint, bigint, boolean];
      tournamentInfo.set(id, { tier: tuple[1], entryFee: tuple[5] });
    }
  });

  const tierLabelOf = (tournamentId: bigint | undefined): string => {
    if (tournamentId === undefined) return 'Tournament';
    const info = tournamentInfo.get(tournamentId);
    const tierId = info ? TOURNAMENT_TIER_IDS[info.tier] : undefined;
    return tierId ? TIER_META[tierId].displayName : `Tournament #${tournamentId.toString()}`;
  };

  // Winnings: every TournamentFinalized payout addressed to this wallet.
  const wins = useQuery({
    queryKey: ['profile-wins', address],
    enabled: Boolean(address) && Boolean(client),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { logs } = await cachedLogScan<FinalizedArgs>({
        event: TOURNAMENT_FINALIZED_EVENT,
        cacheKey: 'tournament-finalized',
      });
      const mine = logs
        .flatMap((log) => {
          const winnerIndex = log.args.winners.findIndex(
            (winner) => winner.toLowerCase() === address!.toLowerCase(),
          );
          if (winnerIndex === -1) return [];
          return [
            {
              tournamentId: log.args.tournamentId,
              place: winnerIndex + 1,
              payout: log.args.payouts[winnerIndex] ?? 0n,
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
            },
          ];
        })
        .sort((a, b) => Number(b.blockNumber - a.blockNumber));
      const timestamps = await blockTimestamps(
        client!,
        mine.slice(0, TIMESTAMPED_ITEMS).map((win) => win.blockNumber),
      );
      return mine.map((win) => ({ ...win, timestamp: timestamps.get(win.blockNumber) }));
    },
  });
  const totalWinnings = wins.data?.reduce((sum, win) => sum + win.payout, 0n);

  // Live rank in each active tournament the user has entered.
  const activeReads = useReadContracts({
    contracts: TOURNAMENT_TIER_IDS.map(
      (tierId) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'getActiveTournament',
          args: [TIER_ENUM_INDEX[tierId]],
        }) as const,
    ),
    query: { refetchInterval: 15_000 },
  });
  const activeTournaments = TOURNAMENT_TIER_IDS.map((_, index) => {
    const read = activeReads.data?.[index];
    return read?.status === 'success' ? (read.result as unknown as ActiveTournament) : undefined;
  });
  const enteredActive = activeTournaments.filter(
    (tournament): tournament is ActiveTournament =>
      Boolean(address) &&
      Boolean(tournament) &&
      tournament!.players.some((player) => player.toLowerCase() === address!.toLowerCase()),
  );
  const rankReads = useReadContracts({
    contracts: enteredActive.map(
      (tournament) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'getLeaderboard',
          args: [tournament.id, BigInt(Math.min(tournament.players.length, 100))],
        }) as const,
    ),
    query: { enabled: enteredActive.length > 0, refetchInterval: 15_000 },
  });
  const activeRanks = enteredActive.map((tournament, index) => {
    const read = rankReads.data?.[index];
    const board = read?.status === 'success' ? (read.result as readonly PlayerEntry[]) : undefined;
    const rank = board?.findIndex(
      (entry) => entry.wallet.toLowerCase() === address!.toLowerCase(),
    );
    return {
      tournament,
      tierId: TOURNAMENT_TIER_IDS[tournament.tier],
      rank: rank !== undefined && rank >= 0 ? rank + 1 : null,
      playerCount: tournament.players.length,
    };
  });

  const totalEntries = history.data?.entered.length;
  const totalSpent = history.data?.entered.reduce(
    (sum, log) => sum + (tournamentInfo.get(log.args.tournamentId)?.entryFee ?? 0n),
    0n,
  );
  const bestScore = history.data?.scores.reduce(
    (max, log) => ((log.args.score ?? 0n) > max ? log.args.score : max),
    0n,
  );

  // Entries, scores, and wins interleaved into one feed, newest first.
  const eventTimestamps = history.data?.timestamps;
  const activity = [
    ...(history.data?.entered.map((log) => ({
      kind: 'entry' as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      timestamp: eventTimestamps?.get(log.blockNumber),
      label: (
        <>
          Entered <span className="font-medium text-white">{tierLabelOf(log.args.tournamentId)}</span>
          <span className="text-muted">
            {' '}
            — {formatUsdc(tournamentInfo.get(log.args.tournamentId)?.entryFee ?? 0n)}
          </span>
        </>
      ),
    })) ?? []),
    ...(history.data?.scores.map((log) => ({
      kind: 'score' as const,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      timestamp: eventTimestamps?.get(log.blockNumber),
      label: (
        <>
          Submitted <span className="font-mono font-semibold text-white">{log.args.score.toString()} pts</span> in{' '}
          <span className="font-medium text-white">{tierLabelOf(log.args.tournamentId)}</span>
        </>
      ),
    })) ?? []),
    ...(wins.data?.map((win) => ({
      kind: 'win' as const,
      blockNumber: win.blockNumber,
      logIndex: -1,
      txHash: win.txHash,
      timestamp: win.timestamp,
      label: (
        <>
          Won <span className="font-mono font-semibold text-gold">{formatUsdc(win.payout)}</span> in{' '}
          <span className="font-medium text-white">{tierLabelOf(win.tournamentId)}</span>
        </>
      ),
    })) ?? []),
  ]
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? b.logIndex - a.logIndex
        : Number(b.blockNumber - a.blockNumber),
    )
    .slice(0, ACTIVITY_ITEMS);

  const ACTIVITY_ICON: Record<'entry' | 'score' | 'win', { Icon: typeof LogIn; classes: string }> = {
    entry: { Icon: LogIn, classes: 'border-live/30 bg-live/10 text-live' },
    score: { Icon: Gamepad2, classes: 'border-accent/30 bg-accent/10 text-accent' },
    win: { Icon: Trophy, classes: 'border-gold/30 bg-gold/10 text-gold' },
  };

  if (!isConnected || !address) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
        <EmptyState
          illustration="wallet"
          size={80}
          title="Connect wallet to see your stats"
          body="Your entries, scores, and winnings live on-chain — connect to pull them up."
          action={<ConnectWallet className="!rounded-btn !bg-accent hover:!bg-accent-hover" />}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-[max(env(safe-area-inset-bottom),6.5rem)] sm:py-8 md:pb-12">
      {/* Identity header */}
      <section className="flex items-center gap-4">
        <IdentityAvatar seed={address} size={64} className="shrink-0 ring-2 ring-accent/25" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="font-display max-w-full truncate text-2xl font-bold tracking-tight">
              {username ?? truncateAddress(address)}
            </h1>
            <span className="flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
              <span className="animate-live-dot inline-flex h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Base Sepolia
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {username && <span className="font-mono text-secondary">{truncateAddress(address)}</span>}
            <a
              href={`${EXPLORER_URL}/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-muted transition-colors hover:text-accent"
            >
              View on Basescan <ExternalLink size={11} aria-hidden />
            </a>
          </div>
        </div>
      </section>

      {/* Stats — 2x2 on mobile, 4-up on desktop */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatBlock
          label="Total winnings"
          icon={<Trophy size={15} className="text-gold/80" aria-hidden />}
          tint="radial-gradient(circle at top right, rgba(239,159,39,0.12) 0%, transparent 60%)"
          loading={wins.isLoading}
          value={
            totalWinnings === undefined ? (
              '—'
            ) : (
              <span className="text-gradient-coin text-glow-prize">{formatUsdc(totalWinnings)}</span>
            )
          }
        />
        <StatBlock
          label="Total entries"
          icon={<Ticket size={15} className="text-accent/80" aria-hidden />}
          tint="radial-gradient(circle at top right, rgba(93,202,165,0.12) 0%, transparent 60%)"
          loading={history.isLoading}
          value={totalEntries ?? '—'}
        />
        <StatBlock
          label="Entry spend"
          icon={<Coins size={15} className="text-danger/70" aria-hidden />}
          tint="radial-gradient(circle at top right, rgba(226,75,74,0.12) 0%, transparent 60%)"
          loading={history.isLoading || (distinctIds.length > 0 && tournamentReads.isLoading)}
          value={totalSpent === undefined ? '—' : formatUsdc(totalSpent)}
        />
        <StatBlock
          label="Best score"
          icon={<Target size={15} className="text-accent-bright/80" aria-hidden />}
          tint="radial-gradient(circle at top right, rgba(159,225,203,0.12) 0%, transparent 60%)"
          loading={history.isLoading}
          value={bestScore === undefined ? '—' : bestScore.toString()}
        />
      </section>

      <SectionCard title="Active tournaments">
        {activeReads.isLoading && (
          <div className="space-y-2.5 p-4">
            {[0, 1].map((index) => (
              <div key={index} className="skeleton h-10 w-full" />
            ))}
          </div>
        )}
        {!activeReads.isLoading && activeRanks.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">
            You haven&apos;t entered any active tournaments yet.{' '}
            <Link href="/" className="text-accent transition-colors hover:text-accent-hover">
              Browse the lobby
            </Link>
            .
          </p>
        )}
        {activeRanks.map(({ tournament, tierId, rank, playerCount }) => (
          <div
            key={tournament.id.toString()}
            className="flex min-h-14 items-center gap-3 px-4 py-3"
          >
            <TierIcon tierId={tierId} size={28} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-display truncate text-sm font-semibold">
                {TIER_META[tierId].displayName}
              </p>
              <p className="text-xs tabular-nums text-muted">
                {rank !== null ? `of ${playerCount} players` : 'no score yet'}
              </p>
            </div>
            {rank !== null && (
              <span
                className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border px-1.5 font-mono text-xs font-bold tabular-nums ${
                  RANK_BADGE[rank] ?? 'border-edge text-white'
                }`}
              >
                #{rank}
              </span>
            )}
            <Link
              href={`/play/${tournament.id.toString()}`}
              className="btn-sheen font-display flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-coin-text transition-shadow hover:shadow-glow"
            >
              <Play size={12} fill="currentColor" aria-hidden /> Play
            </Link>
            <Link
              href={`/leaderboard/${tournament.id.toString()}`}
              aria-label="Leaderboard"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn border border-accent/40 text-accent transition-colors hover:border-accent hover:bg-accent/10"
            >
              <Trophy size={14} aria-hidden />
            </Link>
          </div>
        ))}
      </SectionCard>

      <SectionCard title="Win history">
        {wins.isLoading && (
          <div className="p-4">
            <div className="skeleton h-10 w-full" />
          </div>
        )}
        {wins.isSuccess && wins.data.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Mascot pose="happy" size={72} />
            <p className="max-w-xs text-sm text-muted">
              No wins yet — your first one could be next 🐍 Top 3 pays out automatically when a
              tournament closes.
            </p>
          </div>
        )}
        {wins.isSuccess && wins.data.length > 0 && (
          <div className="relative px-4 py-2">
            {/* Timeline spine */}
            <span aria-hidden className="absolute bottom-6 left-[29.5px] top-6 w-px bg-edge" />
            {wins.data.map((win) => (
              <div
                key={`${win.txHash}-${win.tournamentId.toString()}`}
                className="relative flex items-center gap-3 py-2.5"
              >
                <span className="bg-gradient-gold relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/40">
                  <Medal size={13} className={MEDAL_COLOR[win.place] ?? 'text-gold'} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-mono font-semibold tabular-nums text-gold">
                      {formatUsdc(win.payout)}
                    </span>{' '}
                    <span className="text-secondary">
                      · {['1st', '2nd', '3rd'][win.place - 1] ?? `#${win.place}`} in{' '}
                      {tierLabelOf(win.tournamentId)}
                    </span>
                  </p>
                  {win.timestamp && <p className="text-xs text-muted">{timeAgo(win.timestamp)}</p>}
                </div>
                <a
                  href={`${EXPLORER_URL}/tx/${win.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View transaction"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-accent"
                >
                  <ExternalLink size={13} aria-hidden />
                </a>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Recent activity">
        {history.data?.partial && (
          <p className="border-b border-edge bg-coin/[0.06] px-4 py-2.5 text-xs text-coin">
            Some recent activity may be missing — refresh to retry.
          </p>
        )}
        {history.isLoading && (
          <div className="space-y-2.5 p-4">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-10 w-full" />
            ))}
          </div>
        )}
        {history.isError && (
          <EmptyState
            illustration="disconnected"
            title="Could not load your activity"
            body="The RPC dropped the connection while reading your history. It usually works on a retry."
            action={
              <button
                onClick={() => history.refetch()}
                className="flex min-h-10 items-center justify-center rounded-btn border border-accent/40 px-4 text-sm font-semibold text-accent transition-colors hover:border-accent hover:bg-accent/10"
              >
                Retry
              </button>
            }
          />
        )}
        {history.isSuccess && activity.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No activity yet —{' '}
            <Link href="/" className="text-accent transition-colors hover:text-accent-hover">
              enter a tournament from the lobby
            </Link>
            .
          </p>
        )}
        {activity.map((item) => {
          const { Icon, classes } = ACTIVITY_ICON[item.kind];
          return (
            <div
              key={`${item.txHash}-${item.kind}-${item.logIndex}`}
              className="flex min-h-12 items-center gap-3 px-4 py-2.5 text-sm"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${classes}`}
              >
                <Icon size={13} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-secondary">{item.label}</p>
                {item.timestamp && <p className="text-xs text-muted">{timeAgo(item.timestamp)}</p>}
              </div>
              <a
                href={`${EXPLORER_URL}/tx/${item.txHash}`}
                target="_blank"
                rel="noreferrer"
                aria-label="View transaction"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-accent"
              >
                <ExternalLink size={13} aria-hidden />
              </a>
            </div>
          );
        })}
      </SectionCard>
    </main>
  );
}
