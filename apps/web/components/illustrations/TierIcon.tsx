'use client';

import { useId } from 'react';
import type { TournamentTierId } from '@/lib/contracts';
import { colors } from '@/lib/design-tokens';

/** Per-tier accent color: $1 sprout-teal, $5 silver, $25 cyan, hourly gold. */
export const TIER_ACCENT: Record<TournamentTierId, string> = {
  '1usd_daily': colors.teal,
  '5usd_daily': colors.silver,
  '25usd_daily': colors.cyan,
  '1usd_hourly': colors.gold,
};

interface TierIconProps {
  tierId: TournamentTierId;
  size?: number;
  className?: string;
}

/**
 * Illustrated tier marks (replaces the emoji): sprout for the $1 entry pool,
 * crown for $5, gem for the $25 whale pool, lightning for the hourly sprint.
 * Clean line icons with a soft gradient stroke — quiet, not noisy.
 */
export function TierIcon({ tierId, size = 32, className }: TierIconProps) {
  const gid = useId();
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 32 32',
    fill: 'none',
    'aria-hidden': true as const,
    className,
  };
  const stroke = `url(#${gid})`;

  switch (tierId) {
    case '1usd_daily':
      // Sprout — fresh money, everyone starts here.
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={gid} x1="6" y1="6" x2="26" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#99f6e4" />
              <stop offset="100%" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
          <path d="M16 27v-9" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <path
            d="M16 19c-4.4 0-7.6-2.9-8.1-8.1 5.2.5 8.1 3.7 8.1 8.1Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(45,212,191,0.12)"
          />
          <path
            d="M16 16.5c.3-5 3.4-8.2 8.6-8.6-.4 5.2-3.6 8.3-8.6 8.6Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(45,212,191,0.18)"
          />
          <path d="M10.5 27h11" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
        </svg>
      );
    case '5usd_daily':
      // Crown — mid-tier royalty.
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={gid} x1="6" y1="8" x2="26" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
          </defs>
          <path
            d="M7 21.5V12l5.4 4.4L16 9.5l3.6 6.9L25 12v9.5Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(203,213,225,0.10)"
          />
          <path d="M7 25h18" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16" cy="17.5" r="1.2" fill={stroke} opacity="0.85" />
        </svg>
      );
    case '25usd_daily':
      // Cut gem — the whale pool.
      return (
        <svg {...common}>
          <defs>
            <linearGradient id={gid} x1="5" y1="7" x2="27" y2="27" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#0891b2" />
            </linearGradient>
          </defs>
          <path
            d="M10.5 7h11L27 13.5 16 27 5 13.5Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(6,182,212,0.10)"
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
          <defs>
            <linearGradient id={gid} x1="9" y1="4" x2="24" y2="28" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
          </defs>
          <path
            d="M18 4.5 8.5 18.5h6.4L13 27.5l9.5-14h-6.4Z"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinejoin="round"
            fill="rgba(251,191,36,0.14)"
          />
        </svg>
      );
  }
}
