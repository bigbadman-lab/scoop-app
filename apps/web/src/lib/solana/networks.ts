import { solana } from '@reown/appkit/networks';

/**
 * Solana mainnet for AppKit — sibling to Robinhood eip155:4663.
 * Do not pass this network into WagmiAdapter.
 */
export const solanaAppKitNetwork = solana;

/** Product cluster label for Gate B (mainnet only). */
export const SOLANA_CLUSTER = 'mainnet-beta' as const;

export const SOLANA_CAIP_NETWORK_ID = solana.caipNetworkId;

export const SOLANA_APPKIT_NETWORK_NAME = solana.name;

/** Type guard helper for tests / probe copy. */
export function isSolanaAppKitNetwork(network: {
  chainNamespace?: string;
  caipNetworkId?: string;
}): boolean {
  return (
    network.chainNamespace === 'solana' &&
    network.caipNetworkId === SOLANA_CAIP_NETWORK_ID
  );
}
