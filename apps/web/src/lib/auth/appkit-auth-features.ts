/**
 * Production AppKit auth surface for Join SCOOP.
 *
 * Email login is enabled for the live modal. Social providers stay off.
 * Independent of `NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF` (that flag only
 * gates the isolated `/dev/reown-email-proof` route — never use it for
 * production Join SCOOP enablement).
 */
export function buildScoopAppKitFeatures() {
  return {
    analytics: false as const,
    email: true as const,
    socials: false as const,
    emailShowWallets: true as const,
    /** Requires Reown Dashboard Headless ON + SCOOP custom auth UI. */
    headless: true as const,
  };
}

/**
 * Prefer EOA for Reown embedded (email) wallets — avoid smart-account / Pimlico.
 */
export function buildScoopAppKitDefaultAccountTypes() {
  return { eip155: 'eoa' as const };
}
