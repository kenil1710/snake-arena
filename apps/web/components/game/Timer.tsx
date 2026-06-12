'use client';

import { useEffect, useState } from 'react';
import { formatTimeLeft } from '@/lib/format';

const URGENT_SECONDS = 5 * 60;

/** Countdown to tournament close — turns red and pulses under 5 minutes. */
export function Timer({ endTime }: { endTime: bigint | undefined }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  if (endTime === undefined) return <span className="text-sm text-muted">—</span>;

  const secondsLeft = Number(endTime) - now;
  const urgent = secondsLeft > 0 && secondsLeft < URGENT_SECONDS;

  return (
    <span
      className={`font-mono text-sm tabular-nums ${
        urgent ? 'animate-pulse font-semibold text-danger' : 'text-muted'
      }`}
    >
      {secondsLeft <= 0 ? 'Tournament ended' : `Ends in ${formatTimeLeft(secondsLeft)}`}
    </span>
  );
}
