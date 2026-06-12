'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { WireGameState } from '@/lib/gameApi';

export function ScoreDisplay({ state }: { state: WireGameState }) {
  return (
    <div className="mt-4 flex items-end justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Score</p>
        {/* Re-keying pops the number each time it changes. */}
        <motion.p
          key={state.score}
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.18 }}
          className="origin-left font-mono text-4xl font-bold tabular-nums leading-none"
        >
          {state.score}
        </motion.p>
      </div>

      <div className="flex items-center gap-2">
        <AnimatePresence>
          {state.multiplier > 1 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="rounded-full border border-accent/60 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent"
            >
              ×2 · {state.multiplierApplesRemaining} apples left
            </motion.span>
          )}
          {state.shield && (
            <motion.span
              key="shield"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="rounded-full border border-sky-500/60 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.35)]"
            >
              🛡 Shield
            </motion.span>
          )}
        </AnimatePresence>
        <span className="text-sm tabular-nums text-muted">🍎 {state.applesEaten}</span>
      </div>
    </div>
  );
}
