/**
 * Authoritative SCOOP wallet session.
 * Launch rails read this instead of mixing wagmi and AppKit account hooks.
 * Namespace is set only by an explicit global Sign In choice — never by rail switches.
 */

import type { ScoopWalletNamespace } from '@/lib/auth/wallet-namespace';

const STORAGE_KEY = 'scoop.wallet.namespace';

export type ScoopWalletSession = {
  connected: boolean;
  namespace: ScoopWalletNamespace | null;
  address: string | null;
  providerReady: boolean;
};

type Listener = () => void;

let authoritative: ScoopWalletNamespace | null = null;
let hydrated = false;
const listeners = new Set<Listener>();

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    authoritative = raw === 'solana' || raw === 'eip155' ? raw : null;
  } catch {
    authoritative = null;
  }
}

export function getAuthoritativeWalletNamespace(): ScoopWalletNamespace | null {
  hydrate();
  return authoritative;
}

export function subscribeAuthoritativeWalletNamespace(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Explicit Sign In result. `null` clears (sign out / disconnect). */
export function setAuthoritativeWalletNamespace(
  namespace: ScoopWalletNamespace | null,
): void {
  hydrated = true;
  authoritative = namespace;
  if (typeof window !== 'undefined') {
    try {
      if (namespace) window.sessionStorage.setItem(STORAGE_KEY, namespace);
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }
  for (const listener of listeners) listener();
}

export function clearAuthoritativeWalletNamespace(): void {
  setAuthoritativeWalletNamespace(null);
}

export function resolveScoopWalletSession(input: {
  authoritative: ScoopWalletNamespace | null;
  evmConnected: boolean;
  evmAddress: string | null;
  solanaConnected: boolean;
  solanaAddress: string | null;
  solanaProviderReady: boolean;
}): ScoopWalletSession {
  const disconnected: ScoopWalletSession = {
    connected: false,
    namespace: null,
    address: null,
    providerReady: false,
  };

  const evmOk = input.evmConnected && Boolean(input.evmAddress);
  const solOk = input.solanaConnected && Boolean(input.solanaAddress);

  // Explicit Sign In choice wins. Do not silently fall back to the other chain.
  if (input.authoritative === 'solana') {
    if (!solOk) return disconnected;
    return {
      connected: true,
      namespace: 'solana',
      address: input.solanaAddress,
      providerReady: input.solanaProviderReady,
    };
  }
  if (input.authoritative === 'eip155') {
    if (!evmOk) return disconnected;
    return {
      connected: true,
      namespace: 'eip155',
      address: input.evmAddress,
      providerReady: true,
    };
  }

  // No explicit choice yet: a single live chain is that session.
  // Both live without a choice stays EVM so an injected Phantom cannot
  // silently replace an existing Robinhood wallet.
  if (evmOk && !solOk) {
    return {
      connected: true,
      namespace: 'eip155',
      address: input.evmAddress,
      providerReady: true,
    };
  }
  if (solOk && !evmOk) {
    return {
      connected: true,
      namespace: 'solana',
      address: input.solanaAddress,
      providerReady: input.solanaProviderReady,
    };
  }
  if (evmOk && solOk) {
    return {
      connected: true,
      namespace: 'eip155',
      address: input.evmAddress,
      providerReady: true,
    };
  }
  return disconnected;
}
