import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { resolveRobinhoodPublicRpc } from '@/lib/auth/chain';

/** CAIP-2 id for Robinhood Chain — used by AppKit customRpcUrls. */
export const ROBINHOOD_CAIP_NETWORK_ID = `eip155:${ROBINHOOD_CHAIN_ID}` as const;

/**
 * Override Reown default RPC with SCOOP's public Robinhood endpoint.
 * Pass to both WagmiAdapter and createAppKit (AppKit 1.8.23 requirement).
 */
export function buildRobinhoodCustomRpcUrls(
  env: NodeJS.ProcessEnv = process.env,
): Record<typeof ROBINHOOD_CAIP_NETWORK_ID, { url: string }[]> {
  return {
    [ROBINHOOD_CAIP_NETWORK_ID]: [{ url: resolveRobinhoodPublicRpc(env) }],
  };
}
