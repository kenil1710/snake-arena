'use client';

import { useEffect, useState } from 'react';
import { formatTimeLeftClock, formatTimeLeftCompact } from '@/lib/format';

const AMBER_BELOW_S = 5 * 60;
const RED_BELOW_S = 60;

interface CountdownProps {
  /** On-chain endTime, unix seconds. */
  endTime: bigint;
  /** "compact" → "8h 16m" for cards; "clock" → "1:23:45" for detail pages. */
  format?: 'compact' | 'clock';
  className?: string;
}

/**
 * Ticking countdown in monospace with urgency colors: teal while comfortable,
 * amber under 5 minutes, pulsing red under 1 minute. Renders a placeholder
 * until mounted to avoid SSR hydration mismatch.
 */
export function Countdown({ endTime, format = 'compact', className = '' }: CountdownProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) {
    return <span className={`font-mono tabular-nums text-muted ${className}`}>—</span>;
  }

  const secondsLeft = Number(endTime) - Math.floor(now / 1000);
  if (secondsLeft <= 0) {
    return <span className={`font-mono text-muted ${className}`}>Rolling over…</span>;
  }

  const urgency =
    secondsLeft < RED_BELOW_S
      ? 'animate-pulse text-danger'
      : secondsLeft < AMBER_BELOW_S
        ? 'text-gold'
        : 'text-accent';

  return (
    <span className={`font-mono tabular-nums ${urgency} ${className}`}>
      {format === 'clock' ? formatTimeLeftClock(secondsLeft) : formatTimeLeftCompact(secondsLeft)}
    </span>
  );
}
