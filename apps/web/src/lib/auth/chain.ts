import { defineChain } from '@reown/appkit/networks';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

/**
 * Canonical Robinhood Chain for AppKit — mirrors indexer chain id 4663.
 * Do not duplicate elsewhere; import from here / brand / @scoop/shared.
 */
export const robinhoodAppKitChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  caipNetworkId: `eip155:${ROBINHOOD_CHAIN_ID}`,
  chainNamespace: 'eip155',
  name: 'Robinhood Chain',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [
        (typeof process !== 'undefined' &&
          (process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ||
            process.env.ROBINHOOD_FALLBACK_RPC_URL)) ||
          'https://rpc.mainnet.chain.robinhood.com',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain',
      url: 'https://explorer.mainnet.chain.robinhood.com',
    },
  },
});

export function getReownProjectId(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '').trim();
}

export function isReownConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return getReownProjectId(env).length > 0;
}
