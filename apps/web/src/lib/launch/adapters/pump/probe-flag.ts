/**
 * Gates the isolated `/dev/pump-launch-probe` route only.
 */
export function isScoopPumpProbeEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env === process.env) {
    return (process.env.NEXT_PUBLIC_SCOOP_PUMP_PROBE ?? '').trim() === '1';
  }
  return (env.NEXT_PUBLIC_SCOOP_PUMP_PROBE ?? '').trim() === '1';
}
