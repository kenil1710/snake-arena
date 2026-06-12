import { parseAbi } from 'viem';

/** Events we verify receipts against (enums decode as uint8). */
export const SNAKE_ARENA_EVENTS = parseAbi([
  'event EnteredTournament(uint256 indexed tournamentId, address indexed player, uint256 entryNumber)',
]);

export const POWER_UP_STORE_EVENTS = parseAbi([
  'event PowerUpPurchased(address indexed player, bytes32 indexed sessionId, uint8 powerUpType, uint256 timestamp)',
]);

/** Surface the cron keeper needs: tier → live tournament → finalize. */
export const SNAKE_ARENA_KEEPER_ABI = parseAbi([
  'function currentTournamentId(uint8 tier) view returns (uint256)',
  // Auto-getter of the tournaments mapping (struct minus its `players` array).
  'function tournaments(uint256 tournamentId) view returns (uint256 id, uint8 tier, uint256 startTime, uint256 endTime, uint256 prizePool, uint256 entryFee, bool finalized)',
  'function finalizeTournament(uint256 tournamentId)',
  'event TournamentFinalized(uint256 indexed tournamentId, address[] winners, uint256[] payouts)',
  'event TournamentStarted(uint256 indexed id, uint8 tier, uint256 endTime)',
]);
