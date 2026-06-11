'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Address } from 'viem';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
} from '@/lib/contracts';
import { cachedLogScan, TOURNAMENT_FINALIZED_EVENT, type FinalizedArgs } from '@/lib/events';
import { formatUsdc, timeAgo, truncateAddress } from '@/lib/format';

const FEED_SIZE = 10;
const QUERY_KEY = ['winners-feed'];

interface FeedItem {
  key: string;
  winner: Address;
  username: string | null;
  payout: bigint;
  tierLabel: string;
  timestamp: number;
}

/** Deterministic stand-in avatar: the address bytes pick the gradient hues. */
function Avatar({ address }: { address: Address }) {
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  const hue2 = (hue + 80) % 360;
  return (
    <span
      aria-hidden
      className="inline-block h-6 w-6 shrink-0"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${hue2} 70% 40%))`,
      }}
    />
  );
}

export function WinnersFeed() {
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  const feed = useQuery({
    queryKey: QUERY_KEY,
    enabled: Boolean(publicClient),
    refetchInterval: 60_000, // keeps the "x min ago" labels honest
    queryFn: async (): Promise<FeedItem[]> => {
      const logs = await cachedLogScan<FinalizedArgs>({
        client: publicClient!,
        event: TOURNAMENT_FINALIZED_EVENT,
        cacheKey: 'tournament-finalized',
      });

      const recent = logs
        .filter((log) => log.args.winners.length > 0)
        .sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : Number(b.blockNumber - a.blockNumber)))
        .slice(0, FEED_SIZE);
      if (recent.length === 0) return [];

      // Resolve tier + username in one multicall, timestamps per unique block.
      const reads = await publicClient!.multicall({
        contracts: recent.flatMap((log) => [
          {
            address: SNAKE_ARENA_ADDRESS,
            abi: snakeArenaAbi,
            functionName: 'tournaments',
            args: [log.args.tournamentId],
          } as const,
          {
            address: SNAKE_ARENA_ADDRESS,
            abi: snakeArenaAbi,
            functionName: 'usernames',
            args: [log.args.winners[0]],
          } as const,
        ]),
      });
      const uniqueBlocks = [...new Set(recent.map((log) => log.blockNumber))];
      const blocks = await Promise.all(
        uniqueBlocks.map((blockNumber) => publicClient!.getBlock({ blockNumber })),
      );
      const timestampOf = new Map(uniqueBlocks.map((bn, i) => [bn, Number(blocks[i].timestamp)]));

      return recent.map((log, index) => {
        const tournamentRead = reads[index * 2];
        const usernameRead = reads[index * 2 + 1];
        // tournaments() tuple: [id, tier, startTime, endTime, prizePool, entryFee, finalized]
        const tier =
          tournamentRead?.status === 'success'
            ? TOURNAMENT_TIER_IDS[(tournamentRead.result as unknown as readonly [bigint, number])[1]]
            : undefined;
        return {
          key: `${log.transactionHash}-${log.logIndex}`,
          winner: log.args.winners[0],
          username:
            usernameRead?.status === 'success' ? ((usernameRead.result as string) || null) : null,
          payout: log.args.payouts[0] ?? 0n,
          tierLabel: tier ? TOURNAMENT_TIERS[tier].label : `#${log.args.tournamentId.toString()}`,
          timestamp: timestampOf.get(log.blockNumber) ?? 0,
        };
      });
    },
  });

  // New finalizations land in the feed without a refresh.
  useEffect(() => {
    if (!publicClient) return;
    const unwatch = publicClient.watchContractEvent({
      address: SNAKE_ARENA_ADDRESS,
      abi: snakeArenaAbi,
      eventName: 'TournamentFinalized',
      onLogs: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    });
    return unwatch;
  }, [publicClient, queryClient]);

  const items = feed.data ?? [];

  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
        <span className="inline-block h-1.5 w-1.5 animate-pulse bg-accent" aria-hidden />
        Live winners
      </h2>
      <div className="mt-3 divide-y divide-edge border bg-surface">
        {feed.isLoading && (
          <p className="px-4 py-5 text-center text-sm text-muted">Scanning finalizations…</p>
        )}
        {feed.isSuccess && items.length === 0 && (
          <p className="px-4 py-5 text-center text-sm text-muted">
            No tournaments finalized yet — pools pay out when the clock hits zero.
          </p>
        )}
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.key}
              layout
              initial={{ opacity: 0, x: -16, backgroundColor: 'rgba(20, 184, 166, 0.12)' }}
              animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(20, 184, 166, 0)' }}
              transition={{ duration: 0.5 }}
              className="flex items-center gap-3 px-4 py-3 text-sm"
            >
              <Avatar address={item.winner} />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{item.username ?? truncateAddress(item.winner)}</span>{' '}
                won <span className="tabular-nums text-accent">{formatUsdc(item.payout)}</span> in{' '}
                {item.tierLabel}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {item.timestamp > 0 ? timeAgo(item.timestamp) : ''}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
