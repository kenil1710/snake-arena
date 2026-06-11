'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { parseAbiItem, type Hex } from 'viem';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { ConnectWallet } from '@coinbase/onchainkit/wallet';
import type { Direction } from '@snake-arena/shared';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import { DEPLOY_BLOCK, SNAKE_ARENA_ADDRESS, type ActiveTournament } from '@/lib/contracts';
import {
  GameApiError,
  sendMove,
  startSession,
  type WireGameState,
} from '@/lib/gameApi';
import { playAppleSound, playDeathSound } from '@/lib/sounds';
import { SnakeCanvas } from './SnakeCanvas';
import { ScoreDisplay } from './ScoreDisplay';
import { Timer } from './Timer';
import { PowerUpBar } from './PowerUpBar';
import { GameOver } from './GameOver';

/** Client-driven tick cadence; the server caps accepted moves at 20/sec. */
const TICK_MS = 150;

const ENTERED_EVENT = parseAbiItem(
  'event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber)',
);

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
    <main className="mx-auto flex w-full max-w-[600px] flex-col items-center gap-4 px-4 py-24 text-center">
      {children}
    </main>
  );
}

export function GameClient({ tournamentId }: { tournamentId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [sessionId, setSessionId] = useState<Hex | null>(null);
  const [gameState, setGameState] = useState<WireGameState | null>(null);
  const [startFailure, setStartFailure] = useState<StartFailure | null>(null);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

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
      try {
        const logs = await publicClient.getLogs({
          address: SNAKE_ARENA_ADDRESS,
          event: ENTERED_EVENT,
          args: { tournamentId: BigInt(tournamentId), player: address },
          fromBlock: DEPLOY_BLOCK,
          toBlock: 'latest',
        });
        for (const log of logs.reverse()) candidates.push(log.transactionHash);
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
    const current = stateRef.current;
    if (current && OPPOSITES[direction] === current.direction) return; // never legal
    desiredDirectionRef.current = direction;
  }, []);

  // --- Pre-game screens -----------------------------------------------------

  if (!isConnected || !address) {
    return (
      <Screen>
        <p className="text-sm text-muted">Connect your wallet to play.</p>
        <ConnectWallet className="!rounded-none !bg-accent hover:!bg-accent-hover" />
      </Screen>
    );
  }

  if (startFailure) {
    return (
      <Screen>
        <p className="text-sm font-medium">
          {startFailure.kind === 'no-fresh-entry'
            ? 'No unplayed entry found'
            : 'Could not start the game'}
        </p>
        <p className="max-w-sm text-sm text-muted">
          {startFailure.kind === 'no-fresh-entry'
            ? 'Each entry is one game attempt and all of yours have been played. Enter again from the lobby for another run.'
            : startFailure.message}
        </p>
        <div className="flex gap-3">
          <Link
            href="/"
            className="bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover"
          >
            Back to lobby
          </Link>
          {startFailure.kind !== 'no-fresh-entry' && (
            <button
              onClick={() => {
                startingRef.current = false;
                setStartFailure(null);
              }}
              className="border px-4 py-2 text-sm text-muted transition-colors hover:text-white"
            >
              Retry
            </button>
          )}
        </div>
      </Screen>
    );
  }

  if (!sessionId || !gameState) {
    return (
      <Screen>
        <p className="text-sm text-muted">
          {entryCount === undefined ? 'Checking your entry…' : 'Starting your game…'}
        </p>
      </Screen>
    );
  }

  // --- The game -------------------------------------------------------------

  return (
    <main className="mx-auto w-full max-w-[600px] px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted transition-colors hover:text-white">
          ← Quit
        </Link>
        <Timer endTime={tournament?.endTime} />
      </div>

      <ScoreDisplay state={gameState} />

      <div className="relative mt-3">
        <SnakeCanvas state={gameState} onDirection={handleDirection} />
        {!gameState.alive && (
          <GameOver
            state={gameState}
            sessionId={sessionId}
            onSubmitted={() => setScoreSubmitted(true)}
          />
        )}
      </div>

      <PowerUpBar
        sessionId={sessionId}
        state={gameState}
        scoreSubmitted={scoreSubmitted}
        onState={applyState}
      />

      <p className="mt-3 text-center text-xs text-muted">
        Arrow keys / WASD to steer · swipe on mobile
      </p>
    </main>
  );
}
