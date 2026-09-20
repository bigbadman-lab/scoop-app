import type { LaunchChain, LaunchProvider } from '@/lib/launch/launch-result';

export type { LaunchChain, LaunchProvider };

/** Explicit user choice — never inferred from the connected wallet. */
export type LaunchRail =
  | { chain: 'robinhood'; provider: 'pons' }
  | { chain: 'solana'; provider: 'pump' };

export const DEFAULT_LAUNCH_RAIL: LaunchRail = {
  chain: 'robinhood',
  provider: 'pons',
};

export function isPumpRail(rail: LaunchRail | null | undefined): boolean {
  return rail?.provider === 'pump';
}

export function isPonsRail(rail: LaunchRail | null | undefined): boolean {
  return !rail || rail.provider === 'pons';
}

export function launchRailLabel(rail: LaunchRail): string {
  return rail.provider === 'pump' ? 'Solana → Pump.fun' : 'Robinhood Chain → Pons';
}
