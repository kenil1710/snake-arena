'use client';

import { useId } from 'react';

/**
 * Brand mark: an S-curve serpent in the teal→cyan gradient. Sits left of the
 * "SnakeArena" wordmark in the header and anywhere the app needs a favicon-
 * scale identity.
 */
export function SnakeLogo({ size = 24, className }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {/* Body: head at top-right, S-curve down to the tail. */}
      <path
        d="M18 5h-7.5a3.6 3.6 0 0 0 0 7.2h3a3.6 3.6 0 0 1 0 7.2H6"
        stroke={`url(#${gradientId})`}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* Eye */}
      <circle cx="17.4" cy="4.4" r="0.9" fill="#07090d" />
      {/* Tongue flick */}
      <path
        d="M20.2 5h1.6m-1.6 0 1.3-1m-1.3 1 1.3 1"
        stroke="#f87171"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </svg>
  );
}
