'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
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
import { IdentityAvatar } from '@/components/ui/IdentityAvatar';

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

export function WinnersFeed() {
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  // Items present when data first lands render in place; only wins that arrive
  // later get the slide-in + gold flash.
  const seededRef = useRef(false);

  const feed = useQuery({
    queryKey: QUERY_KEY,
    enabled: Boolean(publicClient),
    refetchInterval: 60_000, // keeps the "x min ago" labels honest
    queryFn: async (): Promise<FeedItem[]> => {
      const { logs } = await cachedLogScan<FinalizedArgs>({
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

  useEffect(() => {
    if (feed.isSuccess && !seededRef.current) seededRef.current = true;
  }, [feed.isSuccess]);

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
    <section className="-mx-4 border-t border-edge px-4 pt-4 md:mx-0 md:border-0 md:px-0 md:pt-0">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        <span className="animate-live-dot inline-flex h-1.5 w-1.5 rounded-full bg-live" aria-hidden />
        <span className="text-live">Live</span> winners
      </h2>

      {feed.isLoading && (
        <div className="mt-2.5 flex gap-2 overflow-hidden md:flex-col">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton h-10 w-56 shrink-0 rounded-full md:w-full md:rounded-card" />
          ))}
        </div>
      )}
      {feed.isSuccess && items.length === 0 && (
        <p className="mt-2.5 text-center text-[13px] text-muted md:rounded-card md:border md:bg-surface md:px-4 md:py-5 md:text-sm">
          No payouts yet — pools pay out when the clock hits zero. 🐍
        </p>
      )}

      {/* Horizontal chip strip on mobile, vertical list on md+ */}
      <div className="scrollbar-none -mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.key}
              layout
              initial={
                seededRef.current
                  ? { opacity: 0, x: 28, boxShadow: '0 0 22px rgba(239,159,39,0.5)' }
                  : false
              }
              animate={{ opacity: 1, x: 0, boxShadow: '0 0 0px rgba(239,159,39,0)' }}
              transition={{
                opacity: { duration: 0.35, ease: 'easeOut' },
                x: { duration: 0.35, ease: 'easeOut' },
                boxShadow: { duration: 1.4, ease: 'easeOut' },
                layout: { type: 'spring', stiffness: 420, damping: 36 },
              }}
              className="flex shrink-0 items-center gap-2 rounded-full border bg-surface py-2 pl-2.5 pr-3.5 text-[13px] shadow-card md:w-full md:rounded-card md:px-4 md:py-3 md:text-sm"
            >
              <Trophy size={13} className="shrink-0 text-gold" aria-hidden />
              <IdentityAvatar seed={item.winner} size={20} />
              <span className="max-w-32 truncate font-medium md:max-w-none">
                {item.username ?? truncateAddress(item.winner)}
              </span>
              <span className="font-mono font-semibold tabular-nums text-accent">
                {formatUsdc(item.payout)}
              </span>
              <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-secondary">
                {item.tierLabel}
              </span>
              <span className="shrink-0 text-xs text-muted md:ml-auto">
                {item.timestamp > 0 ? timeAgo(item.timestamp) : ''}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
