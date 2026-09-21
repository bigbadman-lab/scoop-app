import type { LaunchRail } from '@/lib/launch/launch-rail';
import type { ScoopWalletNamespace } from '@/lib/auth/wallet-namespace';
import type { ScoopAuthMethod } from '@/lib/auth/wallet-session';

export type ResolveNewsLaunchRailInput = {
  authenticated: boolean;
  namespace: ScoopWalletNamespace | null;
  authMethod: ScoopAuthMethod | null;
};

export type NewsLaunchRailResolution =
  | { kind: 'pons'; rail: Extract<LaunchRail, { provider: 'pons' }> }
  | { kind: 'pump'; rail: Extract<LaunchRail, { provider: 'pump' }> }
  | { kind: 'requires_sign_in' };

const PONS_RAIL: Extract<LaunchRail, { provider: 'pons' }> = {
  chain: 'robinhood',
  provider: 'pons',
};

const PUMP_RAIL: Extract<LaunchRail, { provider: 'pump' }> = {
  chain: 'solana',
  provider: 'pump',
};

/**
 * News Create Market rail from the authenticated SCOOP session only.
 * Never infer from address shape, AppKit connection, localStorage, or prior tab.
 */
export function resolveNewsLaunchRail(
  input: ResolveNewsLaunchRailInput,
): NewsLaunchRailResolution {
  if (!input.authenticated || !input.namespace || !input.authMethod) {
    return { kind: 'requires_sign_in' };
  }
  if (input.namespace === 'eip155' && input.authMethod === 'siwe') {
    return { kind: 'pons', rail: PONS_RAIL };
  }
  if (input.namespace === 'solana' && input.authMethod === 'siws') {
    return { kind: 'pump', rail: PUMP_RAIL };
  }
  return { kind: 'requires_sign_in' };
}
