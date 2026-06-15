'use client';

import { useId } from 'react';
import type { TournamentTierId } from '@/lib/contracts';

/** Per-tier accent — matches each card's coin badge: $1 gold, $5 coral, $25 mint, hourly gold. */
export const TIER_ACCENT: Record<TournamentTierId, string> = {
  '1usd_daily': '#EF9F27',
  '5usd_daily': '#F0997B',
  '25usd_daily': '#9FE1CB',
  '1usd_hourly': '#EF9F27',
};

/** Light→accent gradient stops per tier, for the illustrated marks. */
const TIER_STOPS: Record<TournamentTierId, [string, string]> = {
  '1usd_daily': ['#FAC775', '#EF9F27'],
  '5usd_daily': ['#F7C2AD', '#F0997B'],
  '25usd_daily': ['#C9F0E1', '#9FE1CB'],
  '1usd_hourly': ['#FAC775', '#EF9F27'],
};

interface TierIconProps {
  tierId: TournamentTierId;
  size?: number;
  className?: string;
}

/**
 * Illustrated tier marks (replaces the emoji): sprout for the $1 entry pool,
 * crown for $5, gem for the $25 whale pool, lightning for the hourly sprint.
 * Clean line icons with a soft garden gradient stroke — quiet, not noisy.
 */
export function TierIcon({ tierId, size = 32, className }: TierIconProps) {
  const gid = useId();
  const [from, to] = TIER_STOPS[tierId];
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    'aria-hidden': true as const,
    className,
  };
  const stroke = `url(#${gid})`;
  const gradient = (
    <defs>
      <linearGradient id={gid} x1="6" y1="6" x2="26" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor={from} />
        <stop offset="100%" stopColor={to} />
      </linearGradient>
    </defs>
  );

  switch (tierId) {
    case '1usd_daily':
      // Sprout — fresh money, everyone starts here.
      return (
        <svg {...common}>
          {gradient}
          <path d="M16 27v-9" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M16 19c-4.4 0-7.6-2.9-8.1-8.1 5.2.5 8.1 3.7 8.1 8.1Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(151,196,89,0.16)"
          />
          <path
            d="M16 16.5c.3-5 3.4-8.2 8.6-8.6-.4 5.2-3.6 8.3-8.6 8.6Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(151,196,89,0.22)"
          />
          <path d="M10.5 27h11" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        </svg>
      );
    case '5usd_daily':
      // Crown — mid-tier royalty.
      return (
        <svg {...common}>
          {gradient}
          <path
            d="M7 21.5V12l5.4 4.4L16 9.5l3.6 6.9L25 12v9.5Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(240,153,123,0.12)"
          />
          <path d="M7 25h18" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16" cy="17.5" r="1.2" fill={stroke} opacity="0.85" />
        </svg>
      );
    case '25usd_daily':
      // Cut gem — the whale pool.
      return (
        <svg {...common}>
          {gradient}
          <path
            d="M10.5 7h11L27 13.5 16 27 5 13.5Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(159,225,203,0.12)"
          />
          <path
            d="M5 13.5h22M10.5 7l2.6 6.5L16 27m5.5-20-2.6 6.5"
            stroke={stroke}
            strokeWidth="1.4"
            strokeLinejoin="round"
            opacity="0.7"
          />
        </svg>
      );
    case '1usd_hourly':
      // Lightning — a fresh pot every hour.
      return (
        <svg {...common}>
          {gradient}
          <path
            d="M18 4.5 8.5 18.5h6.4L13 27.5l9.5-14h-6.4Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(239,159,39,0.16)"
          />
        </svg>
      );
  }
}
