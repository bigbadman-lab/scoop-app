'use client';

import { createAppKit } from '@reown/appkit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { cookieToInitialState, type Config, WagmiProvider } from 'wagmi';
import {
  buildAppKitMetadata,
  robinhoodAppKitChain,
} from '@/lib/auth/chain';
import {
  scoopAppKitNetworks,
  scoopReownProjectId,
  scoopWagmiAdapter,
  scoopWalletRuntimeConfigured,
} from '@/lib/auth/wagmi-config';

let appKitCreated = false;

function ensureAppKit() {
  if (appKitCreated) return;
  if (!scoopWagmiAdapter || !scoopReownProjectId) return;
  createAppKit({
    adapters: [scoopWagmiAdapter],
    networks: scoopAppKitNetworks,
    defaultNetwork: robinhoodAppKitChain,
    projectId: scoopReownProjectId,
    metadata: buildAppKitMetadata(),
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#FC4C00',
      '--w3m-border-radius-master': '2px',
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });
  appKitCreated = true;
}

ensureAppKit();

type Props = {
  children: ReactNode;
  cookies: string | null;
  onRuntimeReady?: () => void;
};

/**
 * Heavy Reown AppKit + Wagmi providers — dynamically imported only after wallet intent.
 */
export function WalletRuntimeProviders({
  children,
  cookies,
  onRuntimeReady,
}: Props) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    onRuntimeReady?.();
  }, [onRuntimeReady]);

  if (!scoopWagmiAdapter || !scoopWalletRuntimeConfigured) {
    return <>{children}</>;
  }

  const config = scoopWagmiAdapter.wagmiConfig as unknown as Config;

  return (
    <WagmiProvider config={config} initialState={cookieToInitialState(config, cookies)}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
