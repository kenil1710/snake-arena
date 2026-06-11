import { createConfig, http } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';
import { CHAIN_ID, RPC_URL } from './contracts';

/**
 * Local/browser testing config: `preference: 'all'` makes the Coinbase Wallet
 * connector use the browser extension when installed (existing-wallet approval,
 * no email/passkey signup) and fall back to Smart Wallet otherwise.
 *
 * Inside the Base App (Phase 9) this connector is bypassed entirely — the
 * Farcaster Mini App runtime / MiniKit injects the user's wallet itself.
 */
export const wagmiConfig = createConfig({
  chains: [baseSepolia, base],
  connectors: [
    coinbaseWallet({
      appName: 'SnakeArena',
      preference: 'all',
    }),
  ],
  transports: {
    [baseSepolia.id]: http(RPC_URL),
    [base.id]: http('https://mainnet.base.org'),
  },
  ssr: true,
});

export type SupportedChainId = (typeof wagmiConfig)['chains'][number]['id'];

/**
 * The chain every transaction must land on (from NEXT_PUBLIC_CHAIN_ID).
 * Both chains live in the config so switchChain can wallet_addEthereumChain
 * Base Sepolia into wallets that don't have it yet.
 */
export const TARGET_CHAIN_ID = CHAIN_ID as SupportedChainId;

export const CHAIN_NAMES: Record<SupportedChainId, string> = {
  [baseSepolia.id]: 'Base Sepolia',
  [base.id]: 'Base',
};

export const TARGET_CHAIN_NAME = CHAIN_NAMES[TARGET_CHAIN_ID] ?? `chain ${CHAIN_ID}`;

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
