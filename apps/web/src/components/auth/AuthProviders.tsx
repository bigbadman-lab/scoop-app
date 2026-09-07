'use client';

import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { type Config, WagmiProvider } from 'wagmi';
import { robinhoodAppKitChain, getReownProjectId } from '@/lib/auth/chain';
import { buildSiweMessage } from '@/lib/auth/siwe-client';

let cachedWagmiConfig: Config | null = null;

function getOrCreateWagmiConfig(projectId: string): Config {
  if (cachedWagmiConfig) return cachedWagmiConfig;

  const networks = [robinhoodAppKitChain];
  const wagmiAdapter = new WagmiAdapter({
    networks: networks as [typeof robinhoodAppKitChain, ...typeof robinhoodAppKitChain[]],
    projectId,
    ssr: true,
  });

  createAppKit({
    adapters: [wagmiAdapter],
    networks: networks as [typeof robinhoodAppKitChain, ...typeof robinhoodAppKitChain[]],
    projectId,
    metadata: {
      name: 'SCOOP',
      description: 'Turn news into markets on Robinhood Chain',
      url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
      icons: ['/brand/MARK.png'],
    },
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

  // Adapter may resolve a newer @wagmi/core than wagmi@2's types; runtime is compatible.
  cachedWagmiConfig = wagmiAdapter.wagmiConfig as unknown as Config;
  return cachedWagmiConfig;
}

type Props = { children: ReactNode };

/**
 * Reown AppKit + wagmi provider. Children still render when project id is unset
 * so browsing/manual launch survive missing dashboard config.
 */
export function AuthProviders({ children }: Props) {
  const [queryClient] = useState(() => new QueryClient());
  const projectId = getReownProjectId();
  // Initialize with ssr:true adapter on both server and client so the tree matches.
  const [wagmiConfig] = useState(() =>
    projectId ? getOrCreateWagmiConfig(projectId) : null,
  );

  if (!wagmiConfig) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export async function requestSiweSession(
  address: string,
  chainId: number,
  signMessageAsync: (args: { message: string }) => Promise<string>,
): Promise<boolean> {
  const nonceRes = await fetch('/api/auth/nonce', {
    method: 'GET',
    credentials: 'include',
  });
  if (!nonceRes.ok) return false;
  const { nonce } = (await nonceRes.json()) as { nonce?: string };
  if (!nonce) return false;

  const message = buildSiweMessage({
    domain: window.location.host,
    address,
    uri: window.location.origin,
    chainId,
    nonce,
  });

  const signature = await signMessageAsync({ message });
  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  return verifyRes.ok;
}
