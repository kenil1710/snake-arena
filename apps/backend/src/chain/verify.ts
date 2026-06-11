import { parseEventLogs, type Address, type Hex, type Log } from 'viem';
import { POWER_UP_ENUM_INDEX, type PowerUpType } from '@snake-arena/shared';
import { POWER_UP_STORE_EVENTS, SNAKE_ARENA_EVENTS } from './abi.js';
import { logError } from '../log.js';

export type VerificationResult = { ok: true } | { ok: false; reason: string };

/** The slice of a receipt we verify against (works for OP-Stack receipts too). */
export interface ReceiptLike {
  status: 'success' | 'reverted';
  logs: Log[];
}

/** The only RPC capability the verifier needs; any viem public client satisfies it. */
export interface ReceiptReader {
  getTransactionReceipt(args: { hash: Hex }): Promise<ReceiptLike>;
}

/**
 * On-chain payment verification. Injected into the routes so tests (and local
 * dev without an RPC) can substitute a fake.
 */
export interface ChainVerifier {
  /** Confirms `txHash` is a successful entry by `walletAddress` into `tournamentId`. */
  verifyEntry(params: {
    txHash: Hex;
    walletAddress: Address;
    tournamentId: number;
  }): Promise<VerificationResult>;

  /** Confirms `txHash` paid for `powerUpType`, bound to this player + session id. */
  verifyPowerUpPurchase(params: {
    txHash: Hex;
    walletAddress: Address;
    sessionId: Hex;
    powerUpType: PowerUpType;
  }): Promise<VerificationResult>;
}

export interface ChainVerifierOptions {
  client: ReceiptReader;
  snakeArenaAddress: Address;
  powerUpStoreAddress: Address;
}

export function createChainVerifier(options: ChainVerifierOptions): ChainVerifier {
  const { client, snakeArenaAddress, powerUpStoreAddress } = options;

  async function getReceipt(txHash: Hex): Promise<ReceiptLike | null> {
    try {
      return await client.getTransactionReceipt({ hash: txHash });
    } catch (error) {
      // Covers "not found / not yet mined" as well as transient RPC errors.
      logError(`failed to fetch receipt ${txHash}`, error);
      return null;
    }
  }

  return {
    async verifyEntry({ txHash, walletAddress, tournamentId }) {
      const receipt = await getReceipt(txHash);
      if (!receipt) return { ok: false, reason: 'Transaction not found or not yet confirmed' };
      if (receipt.status !== 'success') return { ok: false, reason: 'Transaction reverted' };

      // Match on the event log emitted by the arena rather than `receipt.to`:
      // smart-wallet (ERC-4337) entries route through the EntryPoint, so the
      // outer tx target proves nothing — the log address does.
      const events = parseEventLogs({
        abi: SNAKE_ARENA_EVENTS,
        eventName: 'EnteredTournament',
        logs: receipt.logs,
      });
      const matched = events.some(
        (event) =>
          event.address.toLowerCase() === snakeArenaAddress.toLowerCase() &&
          event.args.tournamentId === BigInt(tournamentId) &&
          event.args.player.toLowerCase() === walletAddress.toLowerCase(),
      );
      if (!matched) {
        return {
          ok: false,
          reason: 'No EnteredTournament event for this player and tournament in that transaction',
        };
      }
      return { ok: true };
    },

    async verifyPowerUpPurchase({ txHash, walletAddress, sessionId, powerUpType }) {
      const receipt = await getReceipt(txHash);
      if (!receipt) return { ok: false, reason: 'Transaction not found or not yet confirmed' };
      if (receipt.status !== 'success') return { ok: false, reason: 'Transaction reverted' };

      const events = parseEventLogs({
        abi: POWER_UP_STORE_EVENTS,
        eventName: 'PowerUpPurchased',
        logs: receipt.logs,
      });
      const matched = events.some(
        (event) =>
          event.address.toLowerCase() === powerUpStoreAddress.toLowerCase() &&
          event.args.player.toLowerCase() === walletAddress.toLowerCase() &&
          event.args.sessionId.toLowerCase() === sessionId.toLowerCase() &&
          event.args.powerUpType === POWER_UP_ENUM_INDEX[powerUpType],
      );
      if (!matched) {
        return {
          ok: false,
          reason: 'No PowerUpPurchased event matching this player, session, and power-up type',
        };
      }
      return { ok: true };
    },
  };
}
