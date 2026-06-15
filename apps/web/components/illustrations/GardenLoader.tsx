'use client';

import { colors } from '@/lib/design-tokens';

/**
 * The app's one spinner: a little snake S whose body draws and retreats on a
 * loop (stroke-dashoffset, keyframed in globals.css as `garden-loader`).
 * Replaces every generic ring spinner. pathLength is normalized to 64 so the
 * dash math is independent of the actual path geometry.
 */
export function GardenLoader({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="status"
      aria-label="Loading"
      className={className}
    >
      <path
        d="M24 7h-9a4.5 4.5 0 0 0 0 9h2a4.5 4.5 0 0 1 0 9H8"
        stroke={colors.accent}
        strokeWidth="3.4"
        strokeLinecap="round"
        pathLength={64}
        strokeDasharray="40 24"
        className="animate-garden-loader"
      />
    </svg>
  );
}
