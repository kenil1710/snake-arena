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
import { Play } from 'lucide-react';
import { truncateAddress } from '@/lib/format';
import { springFast, staggerContainer } from '@/lib/animations';
import { StatsBanner } from '@/components/StatsBanner';
import { TournamentCard, type TopPlayerTeaser } from '@/components/TournamentCard';
import { EntryFlow } from '@/components/EntryFlow';
import { NetworkGuard } from '@/components/NetworkGuard';
import { WinnersFeed } from '@/components/WinnersFeed';
import { HeroBackdrop } from '@/components/illustrations/HeroBackdrop';
import { Mascot } from '@/components/illustrations/Mascot';
import { Bush } from '@/components/illustrations/Bush';

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

  // The hero's gold CTA jumps straight into the $1 daily entry flow; before the
  // pool has loaded it just scrolls the player down to the cards.
  const dailyIndex = TOURNAMENT_TIER_IDS.indexOf('1usd_daily');
  const scrollToTournaments = () =>
    tournamentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const handlePlayNow = () => {
    const tournament = tournaments[dailyIndex];
    if (tournament) setEntryTarget({ tierId: '1usd_daily', tournament });
    else scrollToTournaments();
  };

  return (
    <main className="bg-grid">
      <NetworkGuard>
        {/* Hero — the game's title screen */}
        <section className="relative overflow-hidden">
          <HeroBackdrop />
          {/* Garden horizon — a low hedge grounding the title screen */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-36 overflow-hidden">
            <Bush variant="back" size={240} className="absolute -bottom-6 -left-12 opacity-50" />
            <Bush variant="front" size={180} className="absolute -bottom-4 left-16 opacity-70" />
            <Bush variant="back" size={280} className="absolute -bottom-8 -right-16 opacity-50" />
            <Bush variant="front" size={200} className="absolute -bottom-4 right-14 opacity-70" />
          </div>

          <motion.div
            style={{ opacity: heroOpacity, y: heroY }}
            className="relative mx-auto flex min-h-[64vh] w-full max-w-[840px] flex-col items-center justify-center gap-5 px-4 py-12 text-center sm:min-h-[70vh] sm:gap-6 sm:py-16"
          >
            <Mascot
              pose="hero"
              title="SnakeArena mascot chasing a strawberry"
              className="animate-float h-auto w-[230px] max-w-full drop-shadow-[0_18px_40px_rgba(3,18,15,0.6)] sm:w-[360px]"
            />

            <div>
              <h1 className="text-glow-hero font-display max-w-full text-[38px] font-bold leading-[1.04] tracking-tight sm:text-[60px]">
                Play Snake.
                <br className="sm:hidden" /> Win USDC.
              </h1>
              <p className="mt-3 text-sm text-secondary sm:text-base">
                Pay to enter · Top 3 split the pot ·{' '}
                <span className="font-medium text-white">Live on Base</span>
              </p>
            </div>

            <motion.button
              whileTap={{ scale: 0.96 }}
              transition={springFast}
              onClick={handlePlayNow}
              className="btn-sheen font-display flex min-h-[3.25rem] items-center gap-2.5 rounded-full py-1 pl-1.5 pr-6 text-lg font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_36px_rgba(239,159,39,0.55)]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-coin-light text-coin-text shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
                <Play size={18} fill="currentColor" aria-hidden />
              </span>
              Play now · $1
            </motion.button>

            <StatsBanner totalPlayers={totalPlayers} totalPool={totalPool} />

            <button
              onClick={scrollToTournaments}
              className="group flex min-h-9 items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-accent"
            >
              Browse all tournaments
              <motion.span
                aria-hidden
                animate={{ y: [0, 3, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              >
                ↓
              </motion.span>
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
              <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Tournaments</h2>
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
                        className="absolute -inset-px rounded-full bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_0_14px_rgba(93,202,165,0.45)]"
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
