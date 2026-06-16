'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { X } from 'lucide-react';
import type { Hex } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import { SNAKE_ARENA_ADDRESS } from '@/lib/contracts';
import { toast } from '@/components/Toast';
import { confettiColors } from '@/lib/design-tokens';
import { errorMessage, formatUsdc } from '@/lib/format';
import { endSession, GameApiError, type WireGameState } from '@/lib/gameApi';
import { Mascot } from '@/components/illustrations/Mascot';

type SubmitPhase = 'idle' | 'signing' | 'wallet' | 'confirming' | 'done';

const SUBMIT_LABEL: Record<Exclude<SubmitPhase, 'idle' | 'done'>, string> = {
  signing: 'Getting signature…',
  wallet: 'Confirm in wallet…',
  confirming: 'Submitting on-chain…',
};

/** Mint + gold + berry celebration: a center pop and two side cannons. */
function fireConfetti() {
  const common = { colors: [...confettiColors], zIndex: 200, disableForReducedMotion: true };
  confetti({ ...common, particleCount: 90, spread: 75, origin: { y: 0.4 } });
  setTimeout(() => {
    confetti({ ...common, particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    confetti({ ...common, particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }, 180);
}

/** Decorative confetti specks — only rendered on a celebratory card (see `happy`). */
const CONFETTI_DOTS = [
  { top: '-2%', left: '12%', size: 8, color: '#EF9F27' },
  { top: '8%', left: '93%', size: 6, color: '#9FE1CB' },
  { top: '38%', left: '-3%', size: 7, color: '#E24B4A' },
  { top: '70%', left: '97%', size: 8, color: '#FAC775' },
  { top: '94%', left: '16%', size: 6, color: '#9FE1CB' },
  { top: '88%', left: '82%', size: 7, color: '#EF9F27' },
];

interface GameOverProps {
  state: WireGameState;
  sessionId: Hex;
  tournamentId: number;
  /** Best score already on-chain for this player, this tournament. */
  personalBest: number;
  /** Entry fee for this tournament — shown on the "Play again — $X" button. */
  entryFee: bigint | undefined;
  /** Opens the entry flow for a fresh paid run of the same tournament. */
  onPlayAgain: () => void;
}

export function GameOver({
  state,
  sessionId,
  tournamentId,
  personalBest,
  entryFee,
  onPlayAgain,
}: GameOverProps) {
  const router = useRouter();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [failure, setFailure] = useState<string | null>(null);

  const isNewBest = state.score > personalBest;

  // A run that beats your on-chain best gets its own little burst on arrival.
  useEffect(() => {
    if (isNewBest) fireConfetti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!publicClient) return;
    setFailure(null);
    try {
      setPhase('signing');
      const signed = await endSession({ sessionId });

      setPhase('wallet');
      const txHash = await writeContractAsync({
        address: SNAKE_ARENA_ADDRESS,
        abi: snakeArenaAbi,
        functionName: 'submitScore',
        args: [BigInt(signed.tournamentId), BigInt(signed.score), signed.nonce, signed.signature],
      });

      setPhase('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error('Score submission reverted');

      setPhase('done');
      fireConfetti();
    } catch (error) {
      setPhase('idle');
      const reason =
        error instanceof GameApiError ? error.message : (errorMessage(error) ?? 'Submission failed');
      setFailure(reason);
      toast.error(`Score submission failed: ${reason}`);
    }
  };

  const shareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    `I scored ${state.score} in SnakeArena 🐍 Think you can beat me?`,
  )}`;

  const busy = phase !== 'idle' && phase !== 'done';
  const done = phase === 'done';
  const happy = isNewBest || done;

  // The X and a backdrop tap both bail to the lobby, so the player never gets
  // stranded on a dead board with no way out.
  const closeToLobby = () => router.push('/');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      onClick={closeToLobby}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-sm rounded-card border border-edge-bright bg-surface p-6 pt-12 text-center shadow-card"
      >
        {/* Celebration specks — only on a happy card, so they read as confetti
            rather than stray bugs scattered around a plain game-over. */}
        {happy &&
          CONFETTI_DOTS.map((dot, index) => (
            <span
              key={index}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                top: dot.top,
                left: dot.left,
                width: dot.size,
                height: dot.size,
                backgroundColor: dot.color,
              }}
            />
          ))}

        {/* Mascot pops above the card. */}
        <div className="absolute -top-9 left-1/2 -translate-x-1/2">
          <Mascot pose={happy ? 'happy' : 'dead'} size={78} />
        </div>

        {/* Close → lobby (44×44 touch target). Rendered last so it stays on top. */}
        <button
          onClick={closeToLobby}
          aria-label="Close and return to lobby"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-white"
        >
          <X size={18} aria-hidden />
        </button>

        <p className="font-display text-2xl font-bold tracking-tight">
          {done ? 'Submitted!' : 'Game over'}
        </p>
        <p className="text-gradient-coin mt-2 font-mono text-6xl font-bold tabular-nums leading-none">
          {state.score}
        </p>
        <p className="mt-2 text-sm text-secondary">
          {isNewBest
            ? 'New best! 🎉'
            : personalBest > 0
              ? `Your best today: ${personalBest}`
              : `🍓 ${state.applesEaten} eaten`}
        </p>

        {failure && (
          <p className="mt-4 break-words rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-left text-xs text-danger">
            {failure}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-2.5">
          {done ? (
            <>
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-medium text-accent-bright"
              >
                ✓ Submitted — only your best score counts.
              </motion.p>
              <Link
                href={`/leaderboard/${tournamentId}`}
                className="btn-sheen font-display flex min-h-12 w-full items-center justify-center rounded-full text-sm font-bold text-coin-text shadow-glow transition-shadow hover:shadow-[0_0_28px_rgba(239,159,39,0.5)]"
              >
                View leaderboard →
              </Link>
            </>
          ) : (
            <button
              onClick={submit}
              disabled={busy}
              className="btn-sheen font-display flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-coin-text shadow-glow transition-[opacity,box-shadow] hover:shadow-[0_0_28px_rgba(239,159,39,0.5)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {busy && (
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-coin-text border-t-transparent"
                />
              )}
              {busy ? SUBMIT_LABEL[phase as Exclude<SubmitPhase, 'idle' | 'done'>] : 'Submit score'}
            </button>
          )}

          {/* A new run is a fresh paid entry: opens the entry flow for this same
              tournament, which then redirects into the new game. */}
          <button
            onClick={onPlayAgain}
            className="font-display flex min-h-11 w-full items-center justify-center rounded-full border border-edge text-sm font-semibold text-secondary transition-colors hover:border-accent/50 hover:text-white"
          >
            {entryFee !== undefined ? `Play again — ${formatUsdc(entryFee)}` : 'Play again'}
          </button>
        </div>

        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-xs font-medium text-accent transition-colors hover:text-accent-bright"
        >
          Share on Farcaster ↗
        </a>
      </motion.div>
    </motion.div>
  );
}
