'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { CHAIN_NAMES, TARGET_CHAIN_ID, TARGET_CHAIN_NAME, type SupportedChainId } from '@/lib/wagmi';

/**
 * Blocks interaction while the connected wallet sits on the wrong chain.
 * A wallet on Base mainnet simulating Base Sepolia calldata produces nonsense
 * ("deposit more ETH", fraud warnings), so nothing may reach the wallet until
 * the chain matches. Disconnected visitors browse normally.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending, isError } = useSwitchChain();

  const wrongChain = isConnected && chainId !== undefined && chainId !== TARGET_CHAIN_ID;

  if (!wrongChain) return <>{children}</>;

  const currentName = CHAIN_NAMES[chainId as SupportedChainId] ?? `chain ${chainId}`;

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-amber-700/60 bg-amber-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm font-semibold text-amber-300">Wrong network detected</p>
            <p className="text-xs text-amber-200/80">
              {isError
                ? `Please switch to ${TARGET_CHAIN_NAME} to play.`
                : `Your wallet is on ${currentName} — SnakeArena runs on ${TARGET_CHAIN_NAME}.`}
            </p>
          </div>
          <button
            onClick={() => switchChain({ chainId: TARGET_CHAIN_ID })}
            disabled={isPending}
            className="shrink-0 rounded-btn bg-accent px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-edge disabled:text-muted"
          >
            {isPending ? (
              <>
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border-2 border-background border-t-transparent align-[-1px]"
                />
                Switching to {TARGET_CHAIN_NAME}…
              </>
            ) : (
              `Switch to ${TARGET_CHAIN_NAME}`
            )}
          </button>
        </div>
      </div>

      {/* Lobby stays visible but inert until the chain matches. */}
      <div className="pointer-events-none select-none opacity-50" aria-disabled>
        {children}
      </div>
    </>
  );
}
