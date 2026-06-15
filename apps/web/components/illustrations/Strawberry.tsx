'use client';

import { colors } from '@/lib/design-tokens';

/**
 * The berry the snake chases — a red body, two green leaf ellipses, and three
 * pale seed dots. Used as decoration and the leaderboard "prize" motif; the
 * in-canvas apple is drawn separately on the board.
 */
export function Strawberry({ size = 40, className }: { size?: number; className?: string }) {
  const height = (size * 48) / 40;
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 40 48"
      fill="none"
      aria-hidden
      className={className}
    >
      <ellipse cx="20" cy="30" rx="14" ry="15" fill={colors.berry} />
      <path d="M20 12V7.5" stroke={colors.berryLeaf} strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="14" cy="13" rx="8" ry="4.4" fill={colors.berryLeaf} transform="rotate(-22 14 13)" />
      <ellipse cx="26" cy="13" rx="8" ry="4.4" fill={colors.berryLeaf} transform="rotate(22 26 13)" />
      <circle cx="15" cy="27" r="1.5" fill={colors.berrySeed} />
      <circle cx="25" cy="25" r="1.5" fill={colors.berrySeed} />
      <circle cx="20" cy="35" r="1.5" fill={colors.berrySeed} />
    </svg>
  );
}
