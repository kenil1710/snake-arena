import type { Address } from 'viem';
import {
  TIER_ENUM_INDEX,
  TOURNAMENT_TIER_IDS,
  TOURNAMENT_TIERS,
  type TournamentTierId,
} from '@snake-arena/shared';

function requireAddress(value: string | undefined, name: string): Address {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`Missing or invalid env var ${name} — copy apps/web/.env.example to .env.local`);
  }
  return value as Address;
}

export const SNAKE_ARENA_ADDRESS = requireAddress(
  process.env.NEXT_PUBLIC_SNAKE_ARENA_ADDRESS,
  'NEXT_PUBLIC_SNAKE_ARENA_ADDRESS',
);
export const POWERUP_STORE_ADDRESS = requireAddress(
  process.env.NEXT_PUBLIC_POWERUP_STORE_ADDRESS,
  'NEXT_PUBLIC_POWERUP_STORE_ADDRESS',
);
export const USDC_ADDRESS = requireAddress(
  process.env.NEXT_PUBLIC_USDC_ADDRESS,
  'NEXT_PUBLIC_USDC_ADDRESS',
);

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532);
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://sepolia.base.org';
export const EXPLORER_URL = 'https://sepolia.basescan.org';

/** Block SnakeArena was deployed at — lower bound for profile event scans. */
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '42674891');

export { TIER_ENUM_INDEX, TOURNAMENT_TIER_IDS, TOURNAMENT_TIERS };
export type { TournamentTierId };

/**
 * Per-tier presentation bits that don't belong in the shared package.
 * `displayName` is a UI-only label (contracts/tiers are unchanged); `coinBg` /
 * `coinFg` color the level-select coin badge on each card.
 */
export interface TierMeta {
  icon: string;
  tagline: string;
  displayName: string;
  /** Coin-badge fill + text — see Night Garden palette. */
  coinBg: string;
  coinFg: string;
  /** Hourly tier wears a little lightning mark on its badge. */
  lightning?: boolean;
}

export const TIER_META: Record<TournamentTierId, TierMeta> = {
  '1usd_daily': {
    icon: '🌱',
    tagline: 'Everyone starts here',
    displayName: 'Daily Classic',
    coinBg: '#EF9F27',
    coinFg: '#412402',
  },
  '5usd_daily': {
    icon: '⚔️',
    tagline: 'Mid stakes, real snakes',
    displayName: 'High Stakes',
    coinBg: '#F0997B',
    coinFg: '#4A1B0C',
  },
  '25usd_daily': {
    icon: '🐋',
    tagline: 'Whale pool — big pots',
    displayName: 'Whale Pool',
    coinBg: '#9FE1CB',
    coinFg: '#04342C',
  },
  '1usd_hourly': {
    icon: '⚡',
    tagline: 'Fresh pot every hour',
    displayName: 'Hourly Rush',
    coinBg: '#EF9F27',
    coinFg: '#412402',
    lightning: true,
  },
};

/** Shape of SnakeArena.getActiveTournament / getTournament. */
export interface ActiveTournament {
  id: bigint;
  tier: number;
  startTime: bigint;
  endTime: bigint;
  prizePool: bigint;
  entryFee: bigint;
  finalized: boolean;
  players: readonly Address[];
}

/** Shape of one SnakeArena.getLeaderboard / entries tuple. */
export interface PlayerEntry {
  wallet: Address;
  bestScore: bigint;
  lastSubmissionTime: bigint;
  entryCount: bigint;
}

/**
 * Projected payouts per PrizeDistributor rules: 3+ players → 45/25/20 (+10%
 * treasury, not shown); 1–2 players → winner takes 90%.
 */
export function prizeBreakdown(pool: bigint, playerCount: number): { label: string; amount: bigint }[] {
  if (playerCount >= 3) {
    return [
      { label: '1st', amount: (pool * 45n) / 100n },
      { label: '2nd', amount: (pool * 25n) / 100n },
      { label: '3rd', amount: (pool * 20n) / 100n },
    ];
  }
  return [{ label: 'Winner', amount: (pool * 90n) / 100n }];
}
