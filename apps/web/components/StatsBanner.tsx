'use client';

import { formatUsdc } from '@/lib/format';

interface StatsBannerProps {
  totalPlayers: number | undefined;
  totalPool: bigint | undefined;
}

export function StatsBanner({ totalPlayers, totalPool }: StatsBannerProps) {
  return (
    <section className="grid grid-cols-2 divide-x divide-edge border bg-surface">
      <div className="px-5 py-4">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping bg-accent opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 bg-accent" />
          </span>
          Players in live tournaments
        </p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums">
          {totalPlayers === undefined ? '—' : totalPlayers}
        </p>
      </div>
      <div className="px-5 py-4">
        <p className="text-xs uppercase tracking-wide text-muted">Total prize pool</p>
        <p className="mt-1.5 text-2xl font-semibold tabular-nums text-accent">
          {totalPool === undefined ? '—' : formatUsdc(totalPool)}
        </p>
      </div>
    </section>
  );
}
