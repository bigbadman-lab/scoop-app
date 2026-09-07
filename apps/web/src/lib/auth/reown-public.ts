/**
 * Lightweight Reown public flags — safe for the anonymous shell bundle.
 * MUST NOT import AppKit, Wagmi adapter, or `@reown/appkit/networks`.
 */

/**
 * When `env` is omitted, access `process.env.NEXT_PUBLIC_REOWN_PROJECT_ID`
 * directly so Next.js inlines the same value into server and client bundles.
 */
export function getReownProjectId(env?: NodeJS.ProcessEnv): string {
  if (env) {
    return (env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '').trim();
  }
  return (process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? '').trim();
}

/** Public configured flag for shell UI — same SSR/client value via static inlining. */
export function isReownConfigured(env?: NodeJS.ProcessEnv): boolean {
  return getReownProjectId(env).length > 0;
}

/**
 * Module-level configured bit for the public shell.
 * Derived only from the static NEXT_PUBLIC project id (not Wagmi adapter construction).
 */
export const scoopReownConfigured = isReownConfigured();

/** Shorten an EVM address for chrome (full address remains in app state). */
export function shortenWalletAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Wagmi cookieStorage hint — used to restore connected UI without eager AppKit for anonymous users. */
export function hasWagmiReconnectHint(cookieSource: string | null | undefined): boolean {
  if (!cookieSource) return false;
  return /(?:^|;\s*)wagmi\./.test(cookieSource) || cookieSource.includes('wagmi.store');
}
