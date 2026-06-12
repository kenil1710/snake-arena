import {
  createWalletClient,
  http,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { SNAKE_ARENA_KEEPER_ABI } from './abi.js';
import type { ChainClient } from './client.js';

/** Live tournament state as read from the SnakeArena contract. */
export interface TournamentSnapshot {
  id: bigint;
  tier: number;
  startTime: bigint;
  endTime: bigint;
  prizePool: bigint;
  finalized: boolean;
}

/** Confirmed result of a finalizeTournament transaction. */
export interface FinalizeResult {
  txHash: Hex;
  winners: readonly Address[];
  payouts: readonly bigint[];
  /** Id of the next tournament the contract auto-started (same tier). */
  nextTournamentId: bigint | null;
}

/**
 * The keeper's view of SnakeArena. The cron jobs depend on this interface so
 * tests can substitute a fake instead of a live RPC.
 */
export interface ArenaChain {
  /** Wallet that pays gas for finalization transactions. */
  finalizerAddress: Address;
  /** Latest on-chain block timestamp in seconds (the contract's clock, not ours). */
  getBlockTimestamp(): Promise<bigint>;
  getCurrentTournamentId(tier: number): Promise<bigint>;
  getTournament(tournamentId: bigint): Promise<TournamentSnapshot>;
  /** ETH balance of the finalizer wallet, in wei. */
  getFinalizerBalance(): Promise<bigint>;
  /** Simulates, sends, and waits for confirmation. Throws on revert. */
  finalizeTournament(tournamentId: bigint): Promise<FinalizeResult>;
}

export interface ArenaChainOptions {
  client: ChainClient;
  rpcUrl: string;
  snakeArenaAddress: Address;
  finalizerPrivateKey: Hex;
}

export function createArenaChain(options: ArenaChainOptions): ArenaChain {
  const { client, snakeArenaAddress } = options;
  const account = privateKeyToAccount(options.finalizerPrivateKey);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(options.rpcUrl),
  });

  return {
    finalizerAddress: account.address,

    async getBlockTimestamp() {
      const block = await client.getBlock({ blockTag: 'latest' });
      return block.timestamp;
    },

    async getCurrentTournamentId(tier) {
      return client.readContract({
        address: snakeArenaAddress,
        abi: SNAKE_ARENA_KEEPER_ABI,
        functionName: 'currentTournamentId',
        args: [tier],
      });
    },

    async getTournament(tournamentId) {
      const [id, tier, startTime, endTime, prizePool, , finalized] = await client.readContract({
        address: snakeArenaAddress,
        abi: SNAKE_ARENA_KEEPER_ABI,
        functionName: 'tournaments',
        args: [tournamentId],
      });
      return { id, tier, startTime, endTime, prizePool, finalized };
    },

    async getFinalizerBalance() {
      return client.getBalance({ address: account.address });
    },

    async finalizeTournament(tournamentId) {
      // Simulate first: reverts (NotEnded, AlreadyFinalized, paused) surface as
      // typed errors here without spending gas.
      const { request } = await client.simulateContract({
        account,
        address: snakeArenaAddress,
        abi: SNAKE_ARENA_KEEPER_ABI,
        functionName: 'finalizeTournament',
        args: [tournamentId],
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
      if (receipt.status !== 'success') {
        throw new Error(`finalizeTournament(${tournamentId}) reverted on-chain: ${txHash}`);
      }

      const [finalizedEvent] = parseEventLogs({
        abi: SNAKE_ARENA_KEEPER_ABI,
        eventName: 'TournamentFinalized',
        logs: receipt.logs,
      });
      const [startedEvent] = parseEventLogs({
        abi: SNAKE_ARENA_KEEPER_ABI,
        eventName: 'TournamentStarted',
        logs: receipt.logs,
      });

      return {
        txHash,
        winners: finalizedEvent?.args.winners ?? [],
        payouts: finalizedEvent?.args.payouts ?? [],
        nextTournamentId: startedEvent?.args.id ?? null,
      };
    },
  };
}
