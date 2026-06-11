'use client';

import { useEffect, useState } from 'react';
import { formatTimeLeft } from '@/lib/format';

/**
 * Ticking countdown to an on-chain endTime (unix seconds).
 * Renders a placeholder until mounted to avoid SSR hydration mismatch.
 */
export function Countdown({ endTime }: { endTime: bigint }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) {
    return <span className="tabular-nums text-muted">—</span>;
  }

  const secondsLeft = Number(endTime) - Math.floor(now / 1000);
  if (secondsLeft <= 0) {
    return <span className="text-muted">Rolling over…</span>;
  }
  return (
    <span className={`tabular-nums ${secondsLeft < 300 ? 'text-red-400' : 'text-white'}`}>
      {formatTimeLeft(secondsLeft)}
    </span>
  );
}
