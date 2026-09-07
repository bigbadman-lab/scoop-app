import { defineChain } from '@reown/appkit/networks';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

export {
  getReownProjectId,
  isReownConfigured,
  scoopReownConfigured,
  shortenWalletAddress,
} from '@/lib/auth/reown-public';

/** Canonical public product origin (production metadata / Verify). */
export const SCOOP_CANONICAL_ORIGIN = 'https://scoop.market';

/**
 * Public RPC for AppKit/Wagmi client config.
 * Only NEXT_PUBLIC_* (or the known public Robinhood endpoint) — never server-only secrets.
 */
export function resolveRobinhoodPublicRpc(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromPublic = (env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ?? '').trim();
  if (fromPublic) return fromPublic;
  return 'https://rpc.mainnet.chain.robinhood.com';
}

/**
 * Deterministic AppKit metadata.url for SSR + client (same NODE_ENV / public env).
 * Localhost must not claim production. Optional NEXT_PUBLIC_APP_ORIGIN overrides.
 */
export function resolveAppKitMetadataUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = (env.NEXT_PUBLIC_APP_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (override) return override;
  if (env.NODE_ENV === 'development') return 'http://localhost:3000';
  return SCOOP_CANONICAL_ORIGIN;
}

export function buildAppKitMetadata(env: NodeJS.ProcessEnv = process.env) {
  const url = resolveAppKitMetadataUrl(env);
  return {
    name: 'SCOOP',
    description: 'Turn news into markets on Robinhood Chain',
    url,
    icons: [`${url}/brand/MARK.png`],
  };
}

/**
 * Canonical Robinhood Chain for AppKit — mirrors indexer chain id 4663.
 * Imported only from the lazy wallet boundary (wagmi-config), not the public shell.
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
      http: [resolveRobinhoodPublicRpc()],
    },
  },
  blockExplorers: {
    default: {
      name: 'Robinhood Chain',
      url: 'https://explorer.mainnet.chain.robinhood.com',
    },
  },
});
