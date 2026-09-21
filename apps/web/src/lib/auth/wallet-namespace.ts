/**
 * Helpers for Reown headless wallet lists filtered by AppKit chain namespace.
 */

export type ScoopWalletNamespace = 'eip155' | 'solana';

export type ScoopWalletNamespaceItem = {
  id?: string;
  name?: string;
  isInjected?: boolean;
  connectors?: { id: string; chain?: string }[];
  walletInfo?: {
    supportedNamespaces?: string[];
    supportedChains?: string[];
  };
};

/**
 * Whether a WalletGuide / injected wallet item can connect for `namespace`.
 * Injected wallets must expose a matching connector chain.
 * Remote WC wallets (no injected connectors) are allowed — connect() passes
 * the namespace through to WalletConnect.
 */
export function walletSupportsNamespace(
  wallet: ScoopWalletNamespaceItem,
  namespace: ScoopWalletNamespace,
): boolean {
  const connectors = wallet.connectors ?? [];
  if (connectors.some((c) => c.chain === namespace)) return true;

  const supported = wallet.walletInfo?.supportedNamespaces ?? [];
  if (supported.includes(namespace)) return true;

  // Non-injected explorer / WC entries often omit connectors until connect.
  if (!wallet.isInjected && connectors.length === 0) return true;

  return false;
}

export function filterWalletsByNamespace<T extends ScoopWalletNamespaceItem>(
  wallets: T[],
  namespace: ScoopWalletNamespace,
): T[] {
  return wallets.filter((w) => walletSupportsNamespace(w, namespace));
}
