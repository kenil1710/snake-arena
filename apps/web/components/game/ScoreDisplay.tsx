'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { WireGameState } from '@/lib/gameApi';

/** A pop-in status pill for an active power-up. */
function PowerPill({
  children,
  tone = 'coin',
}: {
  children: React.ReactNode;
  tone?: 'coin' | 'mint';
}) {
  const styles =
    tone === 'mint'
      ? 'border-accent/60 bg-accent/10 text-accent-bright'
      : 'border-coin/60 bg-coin/10 text-coin';
  return (
    <motion.span
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 480, damping: 26 }}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}
    >
      {children}
    </motion.span>
  );
}

export function ScoreDisplay({ state }: { state: WireGameState }) {
  return (
    <div className="mt-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Score</p>
        {/* Re-keying pops the number each time it changes. */}
        <motion.p
          key={state.score}
          initial={{ scale: 1.12 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.18 }}
          className="font-display origin-left text-3xl font-bold tabular-nums leading-none"
        >
          {state.score}
        </motion.p>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <AnimatePresence>
          {state.multiplier > 1 && (
            <PowerPill key="mult">
              2× · {state.multiplierApplesRemaining} left
            </PowerPill>
          )}
          {state.shield && <PowerPill key="shield">🛡 Shield on</PowerPill>}
          {state.slowMo.active && (
            <PowerPill key="slow" tone="mint">
              🐌 Slow-Mo
            </PowerPill>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
