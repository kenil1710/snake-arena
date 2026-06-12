'use client';

import { useId } from 'react';

type Illustration = 'snake' | 'disconnected' | 'wallet';

/** Coiled snake — "nothing here yet" moments. */
function CoiledSnake({ size }: { size: number }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#99f6e4" />
          <stop offset="60%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      {/* Spiral coil, head surfacing at the outer end. */}
      <path
        d="M32 29a4 4 0 1 1-4 4 8 8 0 1 1 8-8 12 12 0 1 1-12 12 16 16 0 1 1 16-16"
        stroke={`url(#${gid})`}
        strokeWidth="3.6"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="39" cy="20.2" r="1" fill="#07090d" />
      <path d="M42.5 18.5l2-1.6m-2 1.6 2.4.6" stroke="#f87171" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** Unplugged cable — RPC / network trouble. */
function DisconnectedWire({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path
        d="M6 38c8 0 12-3 16.5-5.5"
        stroke="#64748b"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect x="20" y="28" width="8" height="9" rx="2.5" transform="rotate(-24 24 32.5)" stroke="#94a3b8" strokeWidth="2" fill="rgba(148,163,184,0.08)" />
      <path
        d="M58 26c-8 0-12 3-16.5 5.5"
        stroke="#64748b"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect x="36" y="27" width="8" height="9" rx="2.5" transform="rotate(156 40 31.5)" stroke="#94a3b8" strokeWidth="2" fill="rgba(148,163,184,0.08)" />
      {/* Spark gap */}
      <path d="M31 22.5l1.4-3M33.6 41.5l-1.4 3M27 19l-.6-2.6M37.6 45l.6 2.6" stroke="#ef4444" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/** Wallet with an incoming arrow — connect prompts. */
function WalletMark({ size }: { size: number }) {
  const gid = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="12" y1="22" x2="52" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <path d="M32 6v9m0 0-4-4m4 4 4-4" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="21" width="40" height="26" rx="6" stroke={`url(#${gid})`} strokeWidth="2.4" fill="rgba(45,212,191,0.07)" />
      <path d="M12 29h28a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H12" stroke={`url(#${gid})`} strokeWidth="2" opacity="0.65" />
      <circle cx="42" cy="34" r="2" fill={`url(#${gid})`} />
    </svg>
  );
}

const ILLUSTRATIONS: Record<Illustration, (props: { size: number }) => JSX.Element> = {
  snake: CoiledSnake,
  disconnected: DisconnectedWire,
  wallet: WalletMark,
};

interface EmptyStateProps {
  illustration: Illustration;
  title?: string;
  body: React.ReactNode;
  /** Optional CTA (button / link) rendered under the copy. */
  action?: React.ReactNode;
  size?: number;
  className?: string;
}

/** Centered illustration + copy for empty, error, and connect states. */
export function EmptyState({ illustration, title, body, action, size = 64, className = '' }: EmptyStateProps) {
  const Art = ILLUSTRATIONS[illustration];
  return (
    <div className={`flex flex-col items-center gap-2 px-4 py-8 text-center ${className}`}>
      <Art size={size} />
      {title && <p className="mt-1 text-sm font-semibold text-white">{title}</p>}
      <p className="max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
