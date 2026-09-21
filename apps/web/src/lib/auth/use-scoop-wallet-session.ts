'use client';

import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';
import type { Provider as SolanaProvider } from '@reown/appkit-adapter-solana/react';
import { useSyncExternalStore } from 'react';
import { useAccount } from 'wagmi';
import {
  getAuthoritativeWalletNamespace,
  resolveScoopWalletSession,
  subscribeAuthoritativeWalletNamespace,
  type ScoopWalletSession,
} from '@/lib/auth/wallet-session';

function subscribe(listener: () => void): () => void {
  return subscribeAuthoritativeWalletNamespace(listener);
}

function snapshot(): string | null {
  return getAuthoritativeWalletNamespace();
}

/** Normalized wallet session for chrome and launch rails. */
export function useScoopWalletSession(): ScoopWalletSession {
  const authoritative = useSyncExternalStore(subscribe, snapshot, () => null);
  const evm = useAccount();
  const solana = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<SolanaProvider>('solana');

  return resolveScoopWalletSession({
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
}
