'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { StatsBanner } from '@/components/StatsBanner';
import { TournamentCard, type TopPlayerTeaser } from '@/components/TournamentCard';
import { EntryFlow } from '@/components/EntryFlow';
import { NetworkGuard } from '@/components/NetworkGuard';
import { WinnersFeed } from '@/components/WinnersFeed';

const REFETCH_MS = 10_000;
const EVENT_REFETCH_DEBOUNCE_MS = 500;

export default function LobbyPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [entryTarget, setEntryTarget] = useState<{
    tierId: TournamentTierId;
    tournament: ActiveTournament;
  } | null>(null);

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

  return (
    <main className="bg-grid">
      <NetworkGuard>
      <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">Tournaments</h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted">
            Pay USDC to enter, play as many times as you like — only your best score counts. Top
            three split the pool when the clock hits zero.
          </p>
        </section>

        <StatsBanner totalPlayers={totalPlayers} totalPool={totalPool} />

        {activeReads.isError && (
          <p className="border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
            Could not load tournaments from Base Sepolia. Check your RPC and refresh.
          </p>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          {TOURNAMENT_TIER_IDS.map((tierId, index) => (
            <TournamentCard
              key={tierId}
              tierId={tierId}
              tournament={tournaments[index]}
              entryCount={entryCounts[index]}
              top3={top3PerTier[index]}
              onEnter={() => {
                const tournament = tournaments[index];
                if (tournament) setEntryTarget({ tierId, tournament });
              }}
            />
          ))}
        </section>

        <WinnersFeed />

        <footer className="mt-auto pt-6 text-xs text-muted">
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
