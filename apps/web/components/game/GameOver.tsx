'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import type { Hex } from 'viem';
import { usePublicClient, useWriteContract } from 'wagmi';
import { snakeArenaAbi } from '@/lib/abis/snakeArena';
import { SNAKE_ARENA_ADDRESS } from '@/lib/contracts';
import { errorMessage } from '@/lib/format';
import { endSession, GameApiError, type WireGameState } from '@/lib/gameApi';

const CONFETTI_COLORS = ['#14b8a6', '#5eead4', '#ef4444', '#facc15', '#ffffff'];
const CONFETTI_COUNT = 60;

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        rotate: (Math.random() - 0.5) * 720,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((piece, index) => (
        <motion.span
          key={index}
          initial={{ y: -16, opacity: 1, rotate: 0 }}
          animate={{ y: '110%', opacity: [1, 1, 0], rotate: piece.rotate }}
          transition={{ duration: piece.duration, delay: piece.delay, ease: 'easeIn' }}
          className="absolute top-0 h-2 w-1.5"
          style={{ left: `${piece.left}%`, backgroundColor: piece.color }}
        />
      ))}
    </div>
  );
}

type SubmitPhase = 'idle' | 'signing' | 'wallet' | 'confirming' | 'done';

const SUBMIT_LABEL: Record<Exclude<SubmitPhase, 'idle' | 'done'>, string> = {
  signing: 'Getting signature…',
  wallet: 'Confirm in wallet…',
  confirming: 'Submitting on-chain…',
};

interface GameOverProps {
  state: WireGameState;
  sessionId: Hex;
  onSubmitted: () => void;
}

export function GameOver({ state, sessionId, onSubmitted }: GameOverProps) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

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
      onSubmitted();
    } catch (error) {
      setPhase('idle');
      setFailure(
        error instanceof GameApiError ? error.message : (errorMessage(error) ?? 'Submission failed'),
      );
    }
  };

  const shareUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(
    `I scored ${state.score} in SnakeArena 🐍 Think you can beat me?`,
  )}`;

  const busy = phase !== 'idle' && phase !== 'done';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      {phase === 'done' && <Confetti />}

      <p className="text-xs uppercase tracking-widest text-muted">
        {phase === 'done' ? 'Score submitted' : 'Game over'}
      </p>
      <p className="text-5xl font-semibold tabular-nums">{state.score}</p>
      <p className="text-sm text-muted">
        {state.applesEaten} apple{state.applesEaten === 1 ? '' : 's'} eaten
      </p>

      {failure && (
        <p className="max-w-xs break-words border border-red-900 bg-red-950/60 px-3 py-2 text-xs text-red-400">
          {failure}
        </p>
      )}

      {phase === 'done' ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-medium text-accent"
        >
          ✓ Submitted! Only your best score counts.
        </motion.p>
      ) : (
        <button
          onClick={submit}
          disabled={busy}
          className="mt-1 w-full max-w-[220px] bg-accent py-2.5 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-muted"
        >
          {busy ? SUBMIT_LABEL[phase as Exclude<SubmitPhase, 'idle' | 'done'>] : 'Submit Score'}
        </button>
      )}

      <div className="mt-1 flex items-center gap-4 text-sm">
        <Link href="/" className="text-muted transition-colors hover:text-white">
          Play Again
        </Link>
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className="text-accent transition-colors hover:text-accent-hover"
        >
          Share on Farcaster
        </a>
      </div>

      {phase !== 'done' && (
        <p className="max-w-xs text-xs text-muted">
          Died with a revive in your pocket? Buy 💚 Revive below to continue this run.
        </p>
      )}
    </motion.div>
  );
}
