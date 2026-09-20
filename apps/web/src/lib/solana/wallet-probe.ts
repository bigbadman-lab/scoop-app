/**
 * Gates the isolated `/dev/solana-wallet-probe` route only.
 * Not used for production auth or launch.
 */
export function isScoopSolanaWalletProbeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env === process.env) {
    return (process.env.NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE ?? '').trim() === '1';
  }
  return (env.NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE ?? '').trim() === '1';
}
