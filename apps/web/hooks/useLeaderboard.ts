'use client';

import { useEffect, useRef } from 'react';
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  type ActiveTournament,
  type PlayerEntry,
} from '@/lib/contracts';

/** Rank lookups are capped here; beyond this a user shows as unranked. */
const MAX_RANKED = 100;
/** Bursts of events (several submissions in one block) collapse to one refetch. */
const REFETCH_DEBOUNCE_MS = 500;

export interface LeaderboardRow extends PlayerEntry {
  username: string | null;
  /** 1-based. */
  rank: number;
}

export interface LeaderboardData {
  tournament: ActiveTournament | undefined;
  rows: LeaderboardRow[];
  /** 1-based rank of the connected wallet, or null if absent/unranked. */
  userRank: number | null;
  userRow: LeaderboardRow | null;
  isLoading: boolean;
}

/**
 * Live tournament ranking. The contract's getLeaderboard view is the source of
 * truth (its sort applies the official tie-break: earlier submission wins);
 * ScoreSubmitted / EnteredTournament events just trigger a debounced refetch,
 * so the board updates within one poll interval of a submission with no manual
 * refresh.
 */
export function useLeaderboard(tournamentId: bigint): LeaderboardData {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const tournamentRead = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'getTournament',
    args: [tournamentId],
  });
  const tournament = tournamentRead.data as unknown as ActiveTournament | undefined;
  const playerCount = tournament?.players.length ?? 0;

  const boardRead = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'getLeaderboard',
    args: [tournamentId, BigInt(Math.min(playerCount, MAX_RANKED))],
    query: { enabled: playerCount > 0 },
  });
  const entries = (boardRead.data ?? []) as readonly PlayerEntry[];

  const usernameReads = useReadContracts({
    contracts: entries.map(
      (entry) =>
        ({
          address: SNAKE_ARENA_ADDRESS,
          abi: snakeArenaAbi,
          functionName: 'usernames',
          args: [entry.wallet],
        }) as const,
    ),
    query: { enabled: entries.length > 0 },
  });

  // The watcher must survive re-renders without re-subscribing, so it reaches
  // the current refetchers through a ref.
  const refetchRef = useRef<() => void>(() => {});
  refetchRef.current = () => {
    tournamentRead.refetch();
    boardRead.refetch();
    usernameReads.refetch();
  };

  useEffect(() => {
    if (!publicClient) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLogs = () => {
      clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), REFETCH_DEBOUNCE_MS);
    };
    const watchCommon = {
      address: SNAKE_ARENA_ADDRESS,
      abi: snakeArenaAbi,
      args: { tournamentId },
      onLogs,
    } as const;
    const unwatchScores = publicClient.watchContractEvent({
      ...watchCommon,
      eventName: 'ScoreSubmitted',
    });
    const unwatchEntries = publicClient.watchContractEvent({
      ...watchCommon,
      eventName: 'EnteredTournament',
    });
    return () => {
      clearTimeout(timer);
      unwatchScores();
      unwatchEntries();
    };
  }, [publicClient, tournamentId]);

  // The contract returns sorted entries; re-sorting is a cheap invariant guard.
  const rows: LeaderboardRow[] = [...entries]
    .sort((a, b) => {
      if (a.bestScore !== b.bestScore) return a.bestScore > b.bestScore ? -1 : 1;
      return a.lastSubmissionTime < b.lastSubmissionTime ? -1 : 1;
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      username:
        usernameReads.data?.[entries.indexOf(entry)]?.status === 'success'
          ? ((usernameReads.data[entries.indexOf(entry)].result as string) || null)
          : null,
    }));

  const userRow = address
    ? (rows.find((row) => row.wallet.toLowerCase() === address.toLowerCase()) ?? null)
    : null;

  return {
    tournament,
    rows,
    userRank: userRow?.rank ?? null,
    userRow,
    isLoading: tournamentRead.isLoading || (playerCount > 0 && boardRead.isLoading),
  };
}
