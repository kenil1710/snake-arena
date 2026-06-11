import { parseAbi } from 'viem';

/** Events we verify receipts against (enums decode as uint8). */
export const SNAKE_ARENA_EVENTS = parseAbi([
  'event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber)',
]);

export const POWER_UP_STORE_EVENTS = parseAbi([
  'event PowerUpPurchased(address indexed player, bytes32 indexed sessionId, uint8 powerUpType, uint256 timestamp)',
]);
