'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useAccount, usePublicClient, useReadContracts } from 'wagmi';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  TIER_ENUM_INDEX,
  TOURNAMENT_TIER_IDS,
  type ActiveTournament,
  type PlayerEntry,
  type TournamentTierId,
} from '@/lib/contracts';
import { truncateAddress } from '@/lib/format';
import { staggerContainer } from '@/lib/animations';
import { StatsBanner } from '@/components/StatsBanner';
import { TournamentCard, type TopPlayerTeaser } from '@/components/TournamentCard';
import { EntryFlow } from '@/components/EntryFlow';
import { NetworkGuard } from '@/components/NetworkGuard';
import { WinnersFeed } from '@/components/WinnersFeed';
import { HeroBackdrop } from '@/components/illustrations/HeroBackdrop';

const REFETCH_MS = 10_000;
const EVENT_REFETCH_DEBOUNCE_MS = 500;

type TierFilter = 'all' | TournamentTierId;

const FILTERS: { key: TierFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: '1usd_daily', label: '$1' },
  { key: '5usd_daily', label: '$5' },
  { key: '25usd_daily', label: '$25' },
  { key: '1usd_hourly', label: 'Hourly' },
];

export default function LobbyPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [filter, setFilter] = useState<TierFilter>('all');
  const [entryTarget, setEntryTarget] = useState<{
    tierId: TournamentTierId;
    tournament: ActiveTournament;
  } | null>(null);
  const tournamentsRef = useRef<HTMLElement>(null);

  // Hero softly collapses as the list scrolls.
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 320], [1, 0]);
  const heroY = useTransform(scrollY, [0, 320], [0, -32]);

  // One getActiveTournament call per tier, batched into a single multicall.
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
    query: { refetchInterval: REFETCH_MS },
  });

  const tournaments = useMemo(
    () =>
      TOURNAMENT_TIER_IDS.map((_, index) => {
        const read = activeReads.data?.[index];
        return read?.status === 'success'
          ? (read.result as unknown as ActiveTournament)
          : undefined;
      }),
    [activeReads.data],
  );

  const allLoaded = tournaments.every(Boolean);

  // The caller's per-tournament entry state (only once ids are known + connected).
  const entryReads = useReadContracts({
    contracts:
      address && allLoaded
        ? tournaments.map(
            (tournament) =>
              ({
                address: SNAKE_ARENA_ADDRESS,
                abi: snakeArenaAbi,
                functionName: 'entries',
                args: [tournament!.id, address],
              }) as const,
          )
        : [],
    query: { enabled: Boolean(address) && allLoaded, refetchInterval: REFETCH_MS },
  });

  const entryCounts = TOURNAMENT_TIER_IDS.map((_, index) => {
    if (!address) return undefined;
    const read = entryReads.data?.[index];
    if (read?.status !== 'success') return undefined;
    // entries() tuple: [wallet, bestScore, lastSubmissionTime, entryCount]
    return (read.result as readonly [string, bigint, bigint, bigint])[3];
  });

  // Top-3 teaser per card: one getLeaderboard(id, 3) for each populated pool.
  const populated = tournaments
    .map((tournament, tierIndex) => ({ tournament, tierIndex }))
    .filter((item) => (item.tournament?.players.length ?? 0) > 0);
  const teaserReads = useReadContracts({
    contracts: populated.map(
      ({ tournament }) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'getLeaderboard',
          args: [tournament!.id, 3n],
        }) as const,
    ),
    query: { enabled: populated.length > 0, refetchInterval: REFETCH_MS },
  });
  const teaserEntries = populated.map((item, index) => ({
    tierIndex: item.tierIndex,
    entries:
      teaserReads.data?.[index]?.status === 'success'
        ? (teaserReads.data[index].result as readonly PlayerEntry[])
        : [],
  }));

  const teaserWallets = teaserEntries.flatMap((t) => t.entries.map((entry) => entry.wallet));
  const teaserNameReads = useReadContracts({
    contracts: teaserWallets.map(
      (wallet) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'usernames',
          args: [wallet],
        }) as const,
    ),
    query: { enabled: teaserWallets.length > 0 },
  });
  const nameOf = new Map<string, string>();
  teaserWallets.forEach((wallet, index) => {
    const read = teaserNameReads.data?.[index];
    if (read?.status === 'success' && read.result) nameOf.set(wallet.toLowerCase(), read.result as string);
  });

  const top3PerTier: TopPlayerTeaser[][] = TOURNAMENT_TIER_IDS.map((_, tierIndex) => {
    const teaser = teaserEntries.find((t) => t.tierIndex === tierIndex);
    return (teaser?.entries ?? [])
      .filter((entry) => entry.bestScore > 0n)
      .map((entry) => ({
        name: nameOf.get(entry.wallet.toLowerCase()) ?? truncateAddress(entry.wallet),
        score: entry.bestScore,
      }));
  });

  // Contract events nudge an immediate refetch so counts/pools/leaders move
  // without waiting out the polling interval.
  const refetchRef = useRef<() => void>(() => {});
  refetchRef.current = () => {
    activeReads.refetch();
    entryReads.refetch();
    teaserReads.refetch();
  };
  useEffect(() => {
    if (!publicClient) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLogs = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), EVENT_REFETCH_DEBOUNCE_MS);
    };
    const unwatchers = (['EnteredTournament', 'ScoreSubmitted', 'TournamentFinalized'] as const).map(
      (eventName) =>
        publicClient.watchContractEvent({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          eventName,
          onLogs,
        }),
    );
    return () => {
      clearTimeout(timer);
      unwatchers.forEach((unwatch) => unwatch());
    };
  }, [publicClient]);

  const totalPlayers = allLoaded
    ? tournaments.reduce((sum, t) => sum + (t?.players.length ?? 0), 0)
    : undefined;
  const totalPool = allLoaded
    ? tournaments.reduce((sum, t) => sum + (t?.prizePool ?? 0n), 0n)
    : undefined;

  const visibleTiers = TOURNAMENT_TIER_IDS.map((tierId, index) => ({ tierId, index })).filter(
    ({ tierId }) => filter === 'all' || tierId === filter,
  );

  return (
    <main className="bg-grid">
      <NetworkGuard>
        {/* Hero — the game's title screen */}
        <section className="relative overflow-hidden">
          <HeroBackdrop />
          <motion.div
            style={{ opacity: heroOpacity, y: heroY }}
            className="relative mx-auto flex min-h-[40vh] w-full max-w-[840px] flex-col items-center justify-center gap-5 px-4 py-14 text-center sm:min-h-[50vh] sm:gap-7 sm:py-20"
          >
            <div>
              <h1 className="text-glow-hero max-w-full text-[40px] font-extrabold leading-[1.05] tracking-tight sm:text-[64px]">
                Play Snake.
                <br className="sm:hidden" /> Win USDC.
              </h1>
              <p className="mt-3 text-sm text-secondary sm:mt-4 sm:text-base">
                Pay to enter. Top 3 split the pot.{' '}
                <span className="font-medium text-white">Live on Base.</span>
              </p>
            </div>

            <StatsBanner totalPlayers={totalPlayers} totalPool={totalPool} />

            <button
              onClick={() =>
                tournamentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="group flex min-h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-secondary transition-colors hover:text-accent"
            >
              <motion.span
                aria-hidden
                animate={{ y: [0, 4, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              >
                ↓
              </motion.span>
              View Tournaments
            </button>
          </motion.div>
        </section>

        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-[max(env(safe-area-inset-bottom),6rem)] sm:gap-8 md:pb-8">
          {!address && (
            <p className="rounded-btn border border-accent/25 bg-accent/[0.06] px-4 py-3 text-center text-[13px] text-secondary">
              👋 Connect your wallet to enter tournaments — browsing is free.
            </p>
          )}

          {activeReads.isError && (
            <p className="rounded-btn border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              Could not load tournaments from Base Sepolia. Check your RPC and refresh.
            </p>
          )}

          {/* Tournaments */}
          <section ref={tournamentsRef} className="scroll-mt-20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Tournaments</h2>
              <div
                role="tablist"
                aria-label="Filter tournaments"
                className="scrollbar-none flex max-w-full gap-1.5 overflow-x-auto rounded-full border bg-surface/80 p-1 backdrop-blur"
              >
                {FILTERS.map((item) => (
                  <button
                    key={item.key}
                    role="tab"
                    aria-selected={filter === item.key}
                    onClick={() => setFilter(item.key)}
                    className={`relative min-h-8 rounded-full border px-2.5 text-xs font-semibold transition-colors sm:px-3.5 ${
                      filter === item.key
                        ? 'border-transparent text-background'
                        : 'border-accent/20 bg-surface-elevated/60 text-accent/80 hover:border-accent/45 hover:text-accent'
                    }`}
                  >
                    {filter === item.key && (
                      <motion.span
                        layoutId="tier-filter-pill"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        className="absolute -inset-px rounded-full bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_14px_rgba(45,212,191,0.4)]"
                      />
                    )}
                    <span className="relative">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <motion.div
              key={filter}
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="mt-4 grid gap-4 sm:grid-cols-2"
            >
              {visibleTiers.map(({ tierId, index }) => (
                <TournamentCard
                  key={tierId}
                  tierId={tierId}
                  tournament={tournaments[index]}
                  entryCount={entryCounts[index]}
                  top3={top3PerTier[index]}
                  connected={Boolean(address)}
                  onEnter={() => {
                    const tournament = tournaments[index];
                    if (tournament) setEntryTarget({ tierId, tournament });
                  }}
                />
              ))}
            </motion.div>
          </section>

          <WinnersFeed />

          <footer className="mt-auto pt-4 text-center text-xs text-muted sm:text-left">
            Live on Base Sepolia · updates in real time
          </footer>
        </div>

        {entryTarget && (
          <EntryFlow
            tierId={entryTarget.tierId}
            tournament={entryTarget.tournament}
            onClose={() => setEntryTarget(null)}
          />
        )}
      </NetworkGuard>
    </main>
  );
}
