/**
 * C.3-proof gate — temporary. Do not treat as production Join SCOOP enablement.
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
