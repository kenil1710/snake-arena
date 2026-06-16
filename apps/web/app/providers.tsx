'use client';

import { useEffect, useState } from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { wagmiConfig } from '@/lib/wagmi';
import { migrateEntriesUsed } from '@/lib/entriesUsed';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // One-time cleanup of the over-eager pre-fix "entries used" counters.
  useEffect(() => {
    migrateEntriesUsed();
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || undefined}
          chain={baseSepolia}
          config={{ appearance: { mode: 'dark' } }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
