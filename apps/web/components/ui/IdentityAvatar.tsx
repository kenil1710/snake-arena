'use client';

import Avatar from 'boring-avatars';
import { colors } from '@/lib/design-tokens';

/** Brand-tinted palette for generated identity avatars. */
const PALETTE = [colors.teal, colors.cyan, colors.gold, colors.surface3, colors.tealSoft];

interface IdentityAvatarProps {
  /** Wallet address (or any stable string) that seeds the artwork. */
  seed: string;
  size?: number;
  className?: string;
}

/** Deterministic jazzicon-style avatar derived from a wallet address. */
export function IdentityAvatar({ seed, size = 20, className = '' }: IdentityAvatarProps) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <Avatar size={size} name={seed.toLowerCase()} variant="beam" colors={[...PALETTE]} />
    </span>
  );
}
