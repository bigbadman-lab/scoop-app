'use client';

import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider as SolanaProvider } from '@reown/appkit-adapter-solana/react';
import { useEffect, useSyncExternalStore } from 'react';
import { useAccount } from 'wagmi';
import { fetchScoopAuthStatus } from '@/lib/auth/siwe-session-client';
import {
  getAuthoritativeWalletNamespace,
  getScoopAuthSnapshot,
  resolveScoopWalletSession,
  subscribeAuthoritativeWalletNamespace,
  type ScoopAuthMethod,
  type ScoopWalletSession,
} from '@/lib/auth/wallet-session';

function subscribe(listener: () => void): () => void {
  return subscribeAuthoritativeWalletNamespace(listener);
}

function snapshot(): string | null {
  return getAuthoritativeWalletNamespace();
}

export type ScoopAppSession = ScoopWalletSession & {
  authenticated: boolean;
  authMethod: ScoopAuthMethod | null;
  userId: string | null;
};

/** Normalized wallet session for chrome and launch rails. */
export function useScoopWalletSession(): ScoopAppSession {
  const authoritative = useSyncExternalStore(subscribe, snapshot, () => null);
  const auth = useSyncExternalStore(subscribe, getScoopAuthSnapshot, () => ({
    authenticated: false,
    namespace: null,
    address: null,
    authMethod: null,
    userId: null,
  }));
  const evm = useAccount();
  const solana = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<SolanaProvider>('solana');

  useEffect(() => {
    void fetchScoopAuthStatus();
  }, []);

  const provider = resolveScoopWalletSession({
    authoritative:
      authoritative === 'eip155' || authoritative === 'solana'
        ? authoritative
        : null,
    evmConnected: Boolean(evm.isConnected),
    evmAddress: evm.address ?? null,
    solanaConnected: Boolean(solana.isConnected),
    solanaAddress: solana.address ?? null,
    solanaProviderReady: Boolean(walletProvider),
  });

  const authenticated = auth.authenticated && Boolean(auth.address) && Boolean(auth.namespace);
  const namespace = authenticated ? auth.namespace : provider.namespace;
  const address = authenticated ? auth.address : provider.address;
  const providerReady =
    provider.connected &&
    provider.providerReady &&
    provider.namespace === namespace &&
    provider.address === address;

  return {
    connected: provider.connected,
    authenticated,
    namespace,
    address,
    providerReady,
    authMethod: authenticated ? auth.authMethod : null,
    userId: authenticated ? auth.userId : null,
  };
}
