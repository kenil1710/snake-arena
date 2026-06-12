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
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: 2 });

interface StatsBannerProps {
  totalPlayers: number | undefined;
  totalPool: bigint | undefined;
}

/** The hero's two stat tiles — glassmorphism over the animated backdrop. */
export function StatsBanner({ totalPlayers, totalPool }: StatsBannerProps) {
  return (
    <section className="grid w-full max-w-md grid-cols-2 gap-3">
      <div className="glass rounded-card border border-white/10 p-4 text-left sm:p-5">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          <span className="animate-live-dot inline-flex h-2 w-2 rounded-full bg-live" aria-hidden />
          Live now
        </p>
        {totalPlayers === undefined ? (
          <div className="skeleton mt-3 h-9 w-16" />
        ) : (
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums leading-tight sm:text-4xl">
            <AnimatedNumber value={totalPlayers} format={(n) => String(Math.round(n))} />
          </p>
        )}
        <p className="mt-0.5 text-[13px] text-muted">players</p>
      </div>

      <div className="glass rounded-card border border-white/10 p-4 text-left sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Total prizes
        </p>
        {totalPool === undefined ? (
          <div className="skeleton mt-3 h-9 w-28" />
        ) : (
          <p className="text-gradient-teal text-glow-prize mt-2 font-mono text-3xl font-bold tabular-nums leading-tight sm:text-4xl">
            <AnimatedNumber value={Number(formatUnits(totalPool, 6))} format={formatDollars} />
          </p>
        )}
        <p className="mt-0.5 text-[13px] text-muted">across live pools</p>
      </div>
    </section>
  );
}
