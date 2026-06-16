'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { Hex } from 'viem';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import type { Direction } from '@snake-arena/shared';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import {
  SNAKE_ARENA_ADDRESS,
  TIER_META,
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
  type ActiveTournament,
} from '@/lib/contracts';
import { cachedLogScan, ENTERED_TOURNAMENT_EVENT, type EnteredArgs } from '@/lib/events';
import {
  GameApiError,
  sendMove,
  startSession,
  type WireGameState,
} from '@/lib/gameApi';
import { sheetUp } from '@/lib/animations';
import { formatUsdc } from '@/lib/format';
import { markEntryUsed } from '@/lib/entriesUsed';
import { playAppleSound, playDeathSound } from '@/lib/sounds';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { Countdown } from '@/components/Countdown';
import { Mascot } from '@/components/illustrations/Mascot';
import { Bush } from '@/components/illustrations/Bush';
import { GardenLoader } from '@/components/illustrations/GardenLoader';
import { EntryFlow } from '@/components/EntryFlow';
import { SnakeCanvas } from './SnakeCanvas';
import { ScoreDisplay } from './ScoreDisplay';
import { PowerUpBar } from './PowerUpBar';
import { GameOver } from './GameOver';
import { LiveLeaderboardPanel } from './LiveLeaderboardPanel';

/** Client-driven tick cadence; the server caps accepted moves at 20/sec. */
const TICK_MS = 150;

const OPPOSITES: Record<Direction, Direction> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

type StartFailure =
  | { kind: 'no-fresh-entry' }
  | { kind: 'backend-down'; message: string }
  | { kind: 'error'; message: string };

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-game-glow min-h-[calc(100vh-3.5rem)]">
      <main className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-4 px-4 py-24 text-center">
        {children}
      </main>
    </div>
  );
}

export function GameClient({ tournamentId }: { tournamentId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Remember the last tournament opened — powers the bottom-nav Play button.
  useEffect(() => {
    try {
      window.localStorage.setItem('sa:lastTournament', String(tournamentId));
    } catch {
      /* storage disabled — non-critical */
    }
  }, [tournamentId]);

  const [sessionId, setSessionId] = useState<Hex | null>(null);
  const [gameState, setGameState] = useState<WireGameState | null>(null);
  const [startFailure, setStartFailure] = useState<StartFailure | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [hasSteered, setHasSteered] = useState(false);

  // Lock background scroll while the mobile leaderboard sheet is up.
  useEffect(() => {
    if (!boardOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [boardOpen]);

  // Refs so the tick loop always sees the latest values without re-binding.
  const stateRef = useRef<WireGameState | null>(null);
  const desiredDirectionRef = useRef<Direction | null>(null);
  const startingRef = useRef(false);

  const tournamentRead = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'getTournament',
    args: [BigInt(tournamentId)],
  });
  const tournament = tournamentRead.data as unknown as ActiveTournament | undefined;

  const entryRead = useReadContract({
    address: SNAKE_ARENA_ADDRESS,
    abi: snakeArenaAbi,
    functionName: 'entries',
    args: address ? [BigInt(tournamentId), address] : undefined,
    query: { enabled: Boolean(address) },
  });
  const entryCount = entryRead.data
    ? (entryRead.data as readonly [string, bigint, bigint, bigint])[3]
    : undefined;
  const personalBest = entryRead.data
    ? Number((entryRead.data as readonly [string, bigint, bigint, bigint])[1])
    : 0;

  // Live rank for the info bar (shares query keys with the leaderboard panel).
  const { userRank } = useLeaderboard(BigInt(tournamentId));
  const tierId = tournament ? TOURNAMENT_TIER_IDS[tournament.tier] : undefined;

  /** Single funnel for every server state update: sounds fire on transitions. */
  const applyState = useCallback((next: WireGameState) => {
    const previous = stateRef.current;
    if (previous && next.applesEaten > previous.applesEaten) playAppleSound();
    if (previous?.alive && !next.alive) playDeathSound();
    stateRef.current = next;
    setGameState(next);
  }, []);

  // Not entered → back to the lobby.
  useEffect(() => {
    if (entryCount !== undefined && entryCount === 0n) {
      router.replace('/?error=not-entered');
    }
  }, [entryCount, router]);

  // Start the session once the wallet + a paid entry are confirmed. Candidate
  // entry txs are tried newest-first: each tx hash buys exactly one session.
  useEffect(() => {
    if (!address || !publicClient || sessionId || startFailure) return;
    if (entryCount === undefined || entryCount === 0n) return;
    if (startingRef.current) return; // StrictMode double-invoke guard
    startingRef.current = true;

    const storageKey = `snakearena:entryTx:${tournamentId}`;

    (async () => {
      const candidates: string[] = [];
      const fromParam = searchParams.get('entryTx');
      if (fromParam && TX_HASH_PATTERN.test(fromParam)) candidates.push(fromParam);
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored && TX_HASH_PATTERN.test(stored)) candidates.push(stored);
      } catch {
        // Storage unavailable — other sources still apply.
      }

      // Fallback for direct navigation: find this wallet's entries on-chain.
      // cachedLogScan walks the range in chunks via the dedicated logs RPC and
      // shares the profile page's per-address cache.
      try {
        const { logs } = await cachedLogScan<EnteredArgs>({
          event: ENTERED_TOURNAMENT_EVENT,
          args: { player: address },
          cacheKey: `entered:${address.toLowerCase()}`,
        });
        const mine = logs
          .filter((log) => log.args.tournamentId === BigInt(tournamentId))
          .sort((a, b) => Number(b.blockNumber - a.blockNumber));
        for (const log of mine) candidates.push(log.transactionHash);
      } catch {
        // RPC hiccup — explicit candidates may still work.
      }

      const unique = [...new Set(candidates.map((tx) => tx.toLowerCase()))];
      if (unique.length === 0) {
        setStartFailure({ kind: 'no-fresh-entry' });
        return;
      }

      for (const entryTxHash of unique) {
        try {
          const { sessionId: id, initialState } = await startSession({
            walletAddress: address,
            tournamentId,
            entryTxHash,
          });
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            // Best effort — the server tracks used entries regardless.
          }
          applyState(initialState);
          setSessionId(id);
          markEntryUsed(address, tournamentId);
          return;
        } catch (error) {
          if (error instanceof GameApiError) {
            if (error.code === 'BACKEND_UNREACHABLE') {
              setStartFailure({ kind: 'backend-down', message: error.message });
              return;
            }
            // ENTRY_ALREADY_USED / ENTRY_VERIFICATION_FAILED → try the next tx.
            continue;
          }
          setStartFailure({ kind: 'error', message: String(error) });
          return;
        }
      }
      setStartFailure({ kind: 'no-fresh-entry' });
    })();
  }, [
    address,
    publicClient,
    sessionId,
    startFailure,
    entryCount,
    tournamentId,
    searchParams,
    applyState,
  ]);

  // Tick loop: the server advances one tick per /move request, so the client
  // posts its current heading on a fixed cadence (halved during slow-mo).
  const alive = gameState?.alive ?? false;
  useEffect(() => {
    if (!sessionId || !alive) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      const startedAt = Date.now();
      const direction = desiredDirectionRef.current ?? stateRef.current?.direction ?? 'RIGHT';
      try {
        const { state } = await sendMove({ sessionId, direction });
        if (!cancelled) applyState(state);
      } catch (error) {
        // GAME_OVER / RATE_LIMITED responses carry the authoritative state.
        if (!cancelled && error instanceof GameApiError && error.state) applyState(error.state);
        // Anything else (network blip) — skip this tick and retry.
      }
      if (cancelled) return;
      const interval = stateRef.current?.slowMo.active ? TICK_MS * 2 : TICK_MS;
      timer = setTimeout(tick, Math.max(40, interval - (Date.now() - startedAt)));
    };

    timer = setTimeout(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId, alive, applyState]);

  const handleDirection = useCallback((direction: Direction) => {
    setHasSteered(true); // any steer attempt dismisses the swipe hint
    const current = stateRef.current;
    if (current && OPPOSITES[direction] === current.direction) return; // never legal
    desiredDirectionRef.current = direction;
  }, []);

  // --- Pre-game screens -----------------------------------------------------

  if (!isConnected || !address) {
    return (
      <Screen>
        <Mascot pose="happy" size={72} />
        <p className="text-sm text-secondary">Connect your wallet to play.</p>
        <ConnectWallet className="!rounded-full !bg-accent hover:!bg-accent-hover" />
      </Screen>
    );
  }

  if (startFailure) {
    const noFreshEntry = startFailure.kind === 'no-fresh-entry';
    return (
      <Screen>
        <div className="w-full max-w-sm rounded-card border bg-surface p-6 text-center shadow-card">
          <Mascot pose="dead" size={64} className="mx-auto" />
          <p className="font-display mt-2 text-base font-bold tracking-tight">
            {noFreshEntry ? 'No unplayed entry found' : 'Could not start the game'}
          </p>
          <p className="mt-2 text-sm text-secondary">
            {noFreshEntry
              ? 'Each entry is one game attempt. Pay again to keep playing.'
              : startFailure.message}
          </p>
          {noFreshEntry ? (
            <div className="mt-5 flex flex-col gap-2.5">
              {tournament && tierId && (
                <button
                  onClick={() => setEntryOpen(true)}
                  className="btn-sheen font-display flex min-h-12 w-full items-center justify-center rounded-full text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
                >
                  Enter again — {formatUsdc(tournament.entryFee)}
                </button>
              )}
              <Link
                href="/"
                className="font-display flex min-h-12 w-full items-center justify-center rounded-full border border-edge text-sm font-semibold text-secondary transition-colors hover:border-accent/50 hover:text-white"
              >
                Back to lobby
              </Link>
            </div>
          ) : (
            <div className="mt-5 flex gap-2.5">
              <Link
                href="/"
                className="flex min-h-12 flex-1 items-center justify-center rounded-btn bg-accent text-sm font-bold text-background transition-colors hover:bg-accent-hover"
              >
                Back to lobby
              </Link>
              <button
                onClick={() => {
                  startingRef.current = false;
                  setStartFailure(null);
                }}
                className="flex min-h-12 flex-1 items-center justify-center rounded-btn border text-sm font-semibold text-secondary transition-colors hover:border-accent/50 hover:text-white"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Re-entry without leaving /play: a fresh paid entry, then GameClient's
            scan picks up the new tx and starts the next run in place. */}
        {entryOpen && tournament && tierId && (
          <EntryFlow
            tierId={tierId}
            tournament={tournament}
            redirectOnSuccess={false}
            onEntered={() => {
              startingRef.current = false;
              setStartFailure(null);
            }}
            onClose={() => setEntryOpen(false)}
          />
        )}
      </Screen>
    );
  }

  if (!sessionId || !gameState) {
    return (
      <Screen>
        <GardenLoader size={36} />
        <p className="text-sm text-secondary">
          {entryCount === undefined ? 'Checking your entry…' : 'Starting your game…'}
        </p>
      </Screen>
    );
  }

  // --- The game -------------------------------------------------------------

  return (
    <div className="bg-game-glow relative min-h-[calc(100vh-3.5rem)]">
      {/* Garden scenery — own clipped layer so it never breaks the sticky sidebar */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-48 overflow-hidden">
        <Bush variant="back" size={220} className="absolute -bottom-8 -left-12 opacity-20" />
        <Bush variant="back" size={260} className="absolute -bottom-10 -right-14 opacity-20" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-[1024px] px-4 py-6">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        {/* Game column */}
        <div className="mx-auto w-full max-w-[600px]">
          {/* Tournament context — quit, tier, pool, clock, rank. Always visible. */}
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="Quit to lobby"
              className="glass flex h-10 w-10 shrink-0 items-center justify-center rounded-btn border border-white/10 text-secondary transition-colors hover:text-white"
            >
              ←
            </Link>
            <div className="glass flex min-h-10 flex-1 items-center justify-between gap-2 rounded-btn border border-white/10 px-3 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                {tierId && (
                  <span
                    className="font-display flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tabular-nums"
                    style={{ backgroundColor: TIER_META[tierId].coinBg, color: TIER_META[tierId].coinFg }}
                  >
                    ${TOURNAMENT_TIERS[tierId].entryFeeUsdc}
                  </span>
                )}
                <span className="font-display truncate text-xs font-bold tracking-tight">
                  {tierId ? TIER_META[tierId].displayName : '…'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5 text-xs">
                <span className="font-mono font-semibold tabular-nums text-accent">
                  {tournament ? formatUsdc(tournament.prizePool) : '—'}
                </span>
                {tournament && <Countdown endTime={tournament.endTime} className="text-xs" />}
                {userRank !== null && (
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums text-gold">
                    #{userRank}
                  </span>
                )}
              </span>
            </div>
          </div>

          <ScoreDisplay state={gameState} />

          <div className="relative mt-3">
            <SnakeCanvas state={gameState} onDirection={handleDirection} />
            <AnimatePresence>
              {gameState.alive && !hasSteered && (
                <motion.div
                  key="swipe-hint"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center lg:hidden"
                >
                  <span className="rounded-full bg-background/80 px-3 py-1.5 text-xs font-medium text-accent-bright backdrop-blur">
                    👆 Swipe to steer
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {!gameState.alive && (
              <GameOver
                state={gameState}
                sessionId={sessionId}
                tournamentId={tournamentId}
                personalBest={personalBest}
              />
            )}
          </div>

          <PowerUpBar sessionId={sessionId} state={gameState} onState={applyState} />

          <button
            onClick={() => setBoardOpen(true)}
            className="mx-auto mt-4 flex w-fit items-center justify-center gap-2 rounded-full border border-edge bg-surface px-5 py-2.5 text-sm font-semibold text-secondary transition-colors hover:border-accent/50 hover:text-white lg:hidden"
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-live" aria-hidden />
            Live leaderboard
          </button>

          <p className="mt-3 hidden text-center text-xs text-muted lg:block">
            Arrow keys / WASD to steer
          </p>
        </div>

        {/* Desktop: ranking lives beside the board */}
        <aside className="hidden lg:sticky lg:top-[4.5rem] lg:block">
          <LiveLeaderboardPanel tournamentId={tournamentId} withInfo />
        </aside>
      </div>

      {/* Mobile: ranking slides up as a sheet */}
      <AnimatePresence>
        {boardOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
            <motion.button
              aria-label="Close leaderboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setBoardOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div
              variants={sheetUp}
              initial="hidden"
              animate="show"
              exit="exit"
              className="relative max-h-[78vh] w-full overflow-y-auto rounded-t-card bg-background p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
            >
              <div className="flex justify-center pb-2.5" aria-hidden>
                <span className="h-1 w-9 rounded-full bg-edge" />
              </div>
              <LiveLeaderboardPanel tournamentId={tournamentId} withInfo />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </main>
    </div>
  );
}
