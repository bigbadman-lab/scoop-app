/**
 * Gates the isolated `/dev/reown-email-proof` route only.
 * Do NOT use this for production Join SCOOP email enablement — AppKit email
 * is controlled by `buildScoopAppKitFeatures()` (always on in product UX).
 * Uses static NEXT_PUBLIC_* access so Next inlines the same SSR/client value.
 */
export function isScoopReownEmailProofEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env === process.env) {
    return (process.env.NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF ?? '').trim() === '1';
  }
  return (env.NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF ?? '').trim() === '1';
}
