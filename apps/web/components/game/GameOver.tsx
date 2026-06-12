'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import type { Hex } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { POWER_UP_PRICES_USDC } from '@snake-arena/shared';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import { SNAKE_ARENA_ADDRESS } from '@/lib/contracts';
import { toast } from '@/components/Toast';
import { confettiColors } from '@/lib/design-tokens';
import { errorMessage } from '@/lib/format';
import { endSession, GameApiError, type WireGameState } from '@/lib/gameApi';
import { STEP_LABEL, usePowerUpPurchase } from './PowerUpBar';

type SubmitPhase = 'idle' | 'signing' | 'wallet' | 'confirming' | 'done';

const SUBMIT_LABEL: Record<Exclude<SubmitPhase, 'idle' | 'done'>, string> = {
  signing: 'Getting signature…',
  wallet: 'Confirm in wallet…',
  confirming: 'Submitting on-chain…',
};

/** Teal + gold celebration: a center pop and two side cannons. */
function fireConfetti() {
  const common = { colors: [...confettiColors], zIndex: 200, disableForReducedMotion: true };
  confetti({ ...common, particleCount: 90, spread: 75, origin: { y: 0.4 } });
  setTimeout(() => {
    confetti({ ...common, particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    confetti({ ...common, particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }, 180);
}

interface GameOverProps {
  state: WireGameState;
  sessionId: Hex;
  tournamentId: number;
  onSubmitted: () => void;
  /** Revive purchases need to push the revived server state back to the game. */
  onState: (state: WireGameState) => void;
}

export function GameOver({ state, sessionId, tournamentId, onSubmitted, onState }: GameOverProps) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const revive = usePowerUpPurchase(sessionId, onState);

  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [failure, setFailure] = useState<string | null>(null);

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
        args: [
          BigInt(signed.tournamentId),
          BigInt(signed.score),
          signed.nonce,
          signed.signature,
        ],
      });

      setPhase('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') throw new Error('Score submission reverted');

      setPhase('done');
      fireConfetti();
      onSubmitted();
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
  const reviving = revive.pending !== null;
  const failureText = failure ?? (phase === 'idle' ? revive.failure : null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="w-full max-w-sm rounded-card border bg-surface p-6 text-center shadow-card"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          {phase === 'done' ? 'Score submitted' : 'Game over'}
        </p>
        <p className="text-gradient-teal mt-3 font-mono text-6xl font-bold tabular-nums leading-none">
          {state.score}
        </p>
        <p className="mt-2 text-sm text-muted">
          🍎 {state.applesEaten} apple{state.applesEaten === 1 ? '' : 's'} eaten
        </p>

        {failureText && (
          <p className="mt-4 break-words rounded-btn border border-danger/40 bg-danger/10 px-3 py-2 text-left text-xs text-danger">
            {failureText}
          </p>
        )}

        {phase === 'done' ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 text-sm font-medium text-accent"
          >
            ✓ Submitted! Only your best score counts.
          </motion.p>
        ) : (
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              onClick={submit}
              disabled={busy || reviving}
              className="bg-gradient-hero flex min-h-12 w-full items-center justify-center gap-2 rounded-btn text-sm font-bold text-background shadow-glow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {busy && (
                <span
                  aria-hidden
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-background border-t-transparent"
                />
              )}
              {busy ? SUBMIT_LABEL[phase as Exclude<SubmitPhase, 'idle' | 'done'>] : 'Submit Score'}
            </button>
            <button
              onClick={() => revive.buy('revive')}
              disabled={busy || reviving}
              className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-btn border border-live/40 text-sm font-semibold text-live transition-colors hover:border-live hover:bg-live/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden>💚</span>
              {reviving
                ? STEP_LABEL[revive.pending!.step]
                : `Revive & keep playing — $${POWER_UP_PRICES_USDC.revive.toFixed(2)}`}
            </button>
          </div>
        )}

        <div className="mt-5 flex items-center justify-center gap-4 border-t border-edge pt-4 text-sm">
          <Link href="/" className="text-muted transition-colors hover:text-white">
            Play Again
          </Link>
          <Link
            href={`/leaderboard/${tournamentId}`}
            className="text-muted transition-colors hover:text-white"
          >
            Leaderboard
          </Link>
          <a
            href={shareUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Share 🔗
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}
