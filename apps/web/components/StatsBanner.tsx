'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { formatUnits } from 'viem';

/** Spring-animated number — counts toward new values instead of snapping. */
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const spring = useSpring(value, { stiffness: 90, damping: 24 });
  useEffect(() => {
    spring.set(value);
  }, [spring, value]);
  const text = useTransform(spring, (current) => format(current));
  return <motion.span>{text}</motion.span>;
}

const formatDollars = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface StatsBannerProps {
  totalPlayers: number | undefined;
  totalPool: bigint | undefined;
}

/** Two compact stat chips under the hero CTA — live players + total prizes. */
export function StatsBanner({ totalPlayers, totalPool }: StatsBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2.5">
      <div className="flex items-center gap-2 rounded-full border bg-surface/80 px-3.5 py-2 backdrop-blur">
        <span className="animate-live-dot inline-flex h-2 w-2 rounded-full bg-live" aria-hidden />
        {totalPlayers === undefined ? (
          <span className="skeleton h-4 w-6" />
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums text-white">
            <AnimatedNumber value={totalPlayers} format={(n) => String(Math.round(n))} />
          </span>
        )}
        <span className="text-[13px] text-muted">playing</span>
      </div>

      <div className="flex items-center gap-2 rounded-full border bg-surface/80 px-3.5 py-2 backdrop-blur">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-coin text-[9px] font-bold text-coin-text" aria-hidden>
          $
        </span>
        {totalPool === undefined ? (
          <span className="skeleton h-4 w-12" />
        ) : (
          <span className="font-mono text-sm font-semibold tabular-nums text-coin-light">
            <AnimatedNumber value={Number(formatUnits(totalPool, 6))} format={formatDollars} />
          </span>
        )}
        <span className="text-[13px] text-muted">in prizes</span>
      </div>
    </div>
  );
}
