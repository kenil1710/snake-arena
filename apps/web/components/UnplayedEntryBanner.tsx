'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAccount, usePublicClient } from 'wagmi';
import { Play, X } from 'lucide-react';
import { TIER_META, type ActiveTournament, type TournamentTierId } from '@/lib/contracts';
import {
  blockTimestamps,
  cachedLogScan,
  ENTERED_TOURNAMENT_EVENT,
  type EnteredArgs,
} from '@/lib/events';
import { getSessionByTx } from '@/lib/gameApi';

/** Beyond this, a paid-but-unplayed entry is considered abandoned. */
const RESUME_WINDOW_MS = 10 * 60 * 1000;

interface UnplayedEntryBannerProps {
  activeTournaments: { tierId: TournamentTierId; tournament: ActiveTournament }[];
}

interface Resumable {
  tournamentId: string;
  txHash: string;
  tierId: TournamentTierId;
  enteredAt: number;
}

/**
 * Safety net for the simple-entry model: if a wallet paid to enter an active
 * tournament in the last 10 minutes but never started a game (no session for
 * that entry tx), offer a one-tap way to play it. Otherwise the payment would
 * be silently lost to the pool. Expires once the entry ages past the window.
 */
export function UnplayedEntryBanner({ activeTournaments }: UnplayedEntryBannerProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [resumable, setResumable] = useState<Resumable | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const activeById = new Map<string, TournamentTierId>(
    activeTournaments.map((t) => [t.tournament.id.toString(), t.tierId]),
  );
  // Stable dep: re-scan only when the set of active tournaments changes.
  const activeKey = [...activeById.keys()].sort().join(',');

  useEffect(() => {
    if (!address || !publicClient || activeById.size === 0) {
      setResumable(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { logs } = await cachedLogScan<EnteredArgs>({
          event: ENTERED_TOURNAMENT_EVENT,
          args: { player: address },
          cacheKey: `entered:${address.toLowerCase()}`,
        });

        // Only entries into still-active tournaments are worth resuming.
        const candidates = logs.filter((log) => activeById.has(log.args.tournamentId.toString()));
        if (candidates.length === 0) {
          if (!cancelled) setResumable(null);
          return;
        }

        const times = await blockTimestamps(
          publicClient,
          candidates.map((log) => log.blockNumber),
        );
        const cutoff = Date.now() - RESUME_WINDOW_MS;
        const recent = candidates
          .map((log) => ({ log, enteredAt: (times.get(log.blockNumber) ?? 0) * 1000 }))
          .filter((entry) => entry.enteredAt >= cutoff)
          .sort((a, b) => b.enteredAt - a.enteredAt);

        // First recent entry with no game session yet is the one to offer.
        for (const { log, enteredAt } of recent) {
          if (cancelled) return;
          let played = true;
          try {
            played = (await getSessionByTx(log.transactionHash)).exists;
          } catch {
            // Backend unreachable — can't confirm, so don't nag the user.
            played = true;
          }
          if (!played) {
            if (!cancelled) {
              setNow(Date.now());
              setResumable({
                tournamentId: log.args.tournamentId.toString(),
                txHash: log.transactionHash,
                tierId: activeById.get(log.args.tournamentId.toString())!,
                enteredAt,
              });
            }
            return;
          }
        }
        if (!cancelled) setResumable(null);
      } catch {
        if (!cancelled) setResumable(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, publicClient, activeKey]);

  // Tick the relative-time label; the banner self-expires at the 10-min mark.
  useEffect(() => {
    if (!resumable) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [resumable]);

  const age = resumable ? now - resumable.enteredAt : 0;
  const show = Boolean(resumable) && !dismissed && age < RESUME_WINDOW_MS;
  const minutesAgo = Math.max(1, Math.floor(age / 60000));

  return (
    <AnimatePresence>
      {show && resumable && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="flex items-center gap-3 rounded-btn border border-coin/40 bg-coin/[0.08] px-4 py-3"
        >
          <span className="min-w-0 flex-1 text-[13px] text-secondary">
            You entered{' '}
            <span className="font-semibold text-white">{TIER_META[resumable.tierId].displayName}</span>{' '}
            {minutesAgo} min ago but didn’t play yet.
          </span>
          <Link
            href={`/play/${resumable.tournamentId}?entryTx=${resumable.txHash}`}
            className="btn-sheen font-display flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-bold text-coin-text shadow-glow"
          >
            <Play size={13} fill="currentColor" aria-hidden /> Play now
          </Link>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 text-muted transition-colors hover:text-white"
          >
            <X size={16} aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
