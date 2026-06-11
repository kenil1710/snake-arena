import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';

/**
 * Return type is inferred on purpose: Base is an OP-Stack chain, and its
 * formatted client type (deposit txs, L1 fee fields) is not assignable to the
 * generic `PublicClient`.
 */
export function createChainClient(rpcUrl: string) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}

export type ChainClient = ReturnType<typeof createChainClient>;
