import { defineChain } from '@reown/appkit/networks';
import { APPKIT_ICON_DATA_URI } from '@/lib/auth/appkit-icon-data-uri';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';

export {
  getReownProjectId,
  isReownConfigured,
  scoopReownConfigured,
  shortenWalletAddress,
} from '@/lib/auth/reown-public';

/** Canonical public product origin (production metadata / Verify). */
export const SCOOP_CANONICAL_ORIGIN = 'https://scoop.fun';

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

/**
 * Icon URLs for AppKit metadata — including the email SIWE “Approve Transaction”
 * UI inside Reown’s HTTPS secure iframe.
 *
 * Do not use `http://localhost…` icons: the iframe blocks mixed content.
 * Do not depend on `${canonical}/brand/…` until that asset is deployed (404 today).
 * Default: embedded data URI so the avatar always resolves.
 * Optional NEXT_PUBLIC_APPKIT_ICON_URL for a public HTTPS CDN/icon override.
 */
export function resolveAppKitMetadataIcons(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const override = (env.NEXT_PUBLIC_APPKIT_ICON_URL ?? '').trim();
  if (override) return [override];
  return [APPKIT_ICON_DATA_URI];
}

export function buildAppKitMetadata(env: NodeJS.ProcessEnv = process.env) {
  const url = resolveAppKitMetadataUrl(env);
  return {
    name: 'SCOOP',
    description: 'Sign in to SCOOP. Confirmations are for login — not payments.',
    url,
    icons: resolveAppKitMetadataIcons(env),
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
