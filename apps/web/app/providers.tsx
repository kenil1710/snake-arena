'use client';

import { useEffect, useState } from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { wagmiConfig } from '@/lib/wagmi';
import { migrateToSimpleEntryModel } from '@/lib/migrateStorage';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // One-time cleanup of legacy "entries used" / entry-tx storage keys.
  useEffect(() => {
    migrateToSimpleEntryModel();
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
