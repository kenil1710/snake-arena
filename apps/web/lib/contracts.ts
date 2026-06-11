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

/** Per-tier presentation bits that don't belong in the shared package. */
export const TIER_META: Record<TournamentTierId, { icon: string; tagline: string }> = {
  '1usd_daily': { icon: '🌱', tagline: 'Mass market — everyone plays' },
  '5usd_daily': { icon: '⚔️', tagline: 'Mid stakes, serious snakes' },
  '25usd_daily': { icon: '🐋', tagline: 'Whale pool — big pots' },
  '1usd_hourly': { icon: '⚡', tagline: 'Fresh pot every hour' },
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
