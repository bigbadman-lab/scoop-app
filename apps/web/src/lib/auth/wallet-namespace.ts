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

/** Solana-primary / multi-chain wallets safe to offer on the Pump rail. */
const SOLANA_WALLET_HINT =
  /phantom|solflare|backpack|glow|solana|exodus|tiplink|magic.?eden|ultimate|okx|bitget|trust|coinbase|brave|ledger|binance|bybit|safepal|math.?wallet|torus|slope|nightly|jupiter|fuse|salmon/i;

function hasSolanaHint(wallet: ScoopWalletNamespaceItem): boolean {
  const supported = wallet.walletInfo?.supportedNamespaces ?? [];
  if (supported.includes('solana')) return true;

  const chains = wallet.walletInfo?.supportedChains ?? [];
  if (chains.some((c) => /solana/i.test(c))) return true;

  const label = `${wallet.name ?? ''} ${wallet.id ?? ''}`;
  return SOLANA_WALLET_HINT.test(label);
}

/**
 * Whether a WalletGuide / injected wallet item can connect for `namespace`.
 * Injected wallets must expose a matching connector chain (or a Solana name
 * hint when the list only mapped the EVM injector — e.g. Phantom ethereum).
 * Remote WC wallets for Solana require an explicit Solana capability hint so
 * MetaMask / Ethereum-only entries are not offered.
 */
export function walletSupportsNamespace(
  wallet: ScoopWalletNamespaceItem,
  namespace: ScoopWalletNamespace,
): boolean {
  const connectors = wallet.connectors ?? [];
  if (connectors.some((c) => c.chain === namespace)) return true;

  const supported = wallet.walletInfo?.supportedNamespaces ?? [];
  if (supported.includes(namespace)) return true;

  if (namespace === 'solana') {
    // Phantom et al. may appear as eip155-injected only; still offer for Solana
    // so connect can resolve the WalletStandard Solana connector by name.
    if (hasSolanaHint(wallet)) return true;
    return false;
  }

  // eip155: non-injected explorer / WC entries often omit connectors until connect.
  if (!wallet.isInjected && connectors.length === 0) return true;

  return false;
}

export function filterWalletsByNamespace<T extends ScoopWalletNamespaceItem>(
  wallets: T[],
  namespace: ScoopWalletNamespace,
): T[] {
  return wallets.filter((w) => walletSupportsNamespace(w, namespace));
}
