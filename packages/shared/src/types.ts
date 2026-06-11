// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------

export const TOURNAMENT_TIER_IDS = [
  '1usd_daily',
  '5usd_daily',
  '25usd_daily',
  '1usd_hourly',
] as const;

export type TournamentTierId = (typeof TOURNAMENT_TIER_IDS)[number];

/**
 * Maps a tier id to its index in the `TournamentTier` enum of SnakeArena.sol.
 * The contract enum order must never change once deployed.
 */
export const TIER_ENUM_INDEX: Record<TournamentTierId, number> = {
  '1usd_daily': 0,
  '5usd_daily': 1,
  '25usd_daily': 2,
  '1usd_hourly': 3,
};

export interface TournamentTierConfig {
  id: TournamentTierId;
  label: string;
  entryFeeUsdc: number;
  durationHours: number;
}

export const TOURNAMENT_TIERS: Record<TournamentTierId, TournamentTierConfig> = {
  '1usd_daily': { id: '1usd_daily', label: '$1 Daily', entryFeeUsdc: 1, durationHours: 24 },
  '5usd_daily': { id: '5usd_daily', label: '$5 Daily', entryFeeUsdc: 5, durationHours: 24 },
  '25usd_daily': { id: '25usd_daily', label: '$25 Daily', entryFeeUsdc: 25, durationHours: 24 },
  '1usd_hourly': { id: '1usd_hourly', label: '$1 Hourly', entryFeeUsdc: 1, durationHours: 1 },
};

export type TournamentStatus = 'active' | 'finalizing' | 'completed';

export interface Tournament {
  /** Database id (uuid). */
  id: string;
  /** Id of the tournament inside SnakeArena.sol. */
  contractTournamentId: number;
  tier: TournamentTierId;
  /** ISO-8601 timestamps. */
  startTime: string;
  endTime: string;
  prizePoolUsdc: number;
  status: TournamentStatus;
}

export interface LeaderboardEntry {
  walletAddress: string;
  username: string | null;
  bestScore: number;
  /** ISO-8601; earlier submission wins ties. */
  bestScoreSubmittedAt: string | null;
  entryCount: number;
}

// ---------------------------------------------------------------------------
// Game engine
// ---------------------------------------------------------------------------

export const GRID_WIDTH = 20;
export const GRID_HEIGHT = 20;

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Position {
  x: number;
  y: number;
}

export type SessionStatus = 'playing' | 'died' | 'submitted';

export interface GameState {
  sessionId: string;
  snake: Position[];
  direction: Direction;
  /** Null only in the (practically unreachable) case that the snake fills the board. */
  apple: Position | null;
  score: number;
  multiplier: number;
  shield: boolean;
  slowMo: { active: boolean; until: number };
  alive: boolean;
}

// ---------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------

export const POWER_UP_TYPES = ['shield', 'multiplier_2x', 'slowmo', 'revive'] as const;

export type PowerUpType = (typeof POWER_UP_TYPES)[number];

/** Maps a power-up to its index in the `PowerUpType` enum of PowerUpStore.sol. */
export const POWER_UP_ENUM_INDEX: Record<PowerUpType, number> = {
  shield: 0,
  multiplier_2x: 1,
  slowmo: 2,
  revive: 3,
};

export const POWER_UP_PRICES_USDC: Record<PowerUpType, number> = {
  shield: 0.25,
  multiplier_2x: 0.5,
  slowmo: 0.25,
  revive: 0.5,
};

// ---------------------------------------------------------------------------
// Score signing (backend -> contract)
// ---------------------------------------------------------------------------

export interface SignedScore {
  tournamentId: number;
  walletAddress: string;
  score: number;
  /** bytes32 hex, single use. */
  nonce: string;
  /** ECDSA signature from the trusted backend signer. */
  signature: string;
}

// ---------------------------------------------------------------------------
// Chain constants
// ---------------------------------------------------------------------------

export const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const USDC_DECIMALS = 6;
