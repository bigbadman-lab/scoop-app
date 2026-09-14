/**
 * Gates the SCOOP-native auth sheet (Phase A).
 * When unset/false, production continues to use the Reown AppKit Connect modal.
 * This is NOT Reown Dashboard/SDK `features.headless`.
 * Uses static NEXT_PUBLIC_* access so Next inlines the same SSR/client value.
 */
export function isScoopCustomAuthUiEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env === process.env) {
    return (process.env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI ?? '').trim() === '1';
  }
  return (env.NEXT_PUBLIC_SCOOP_CUSTOM_AUTH_UI ?? '').trim() === '1';
}
