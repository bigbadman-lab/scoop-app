/**
 * Whether the globally signed-in wallet may launch on the selected rail.
 * Launch pages read this; they do not open their own wallet picker.
 */

import type { ScoopWalletNamespace } from '@/lib/auth/wallet-namespace';

export type LaunchRailKind = 'pons' | 'pump';

export type RailCompatibilityStatus =
  | 'requires_sign_in'
  | 'compatible'
  | 'incompatible_namespace';

export type RailCompatibility = {
  status: RailCompatibilityStatus;
  message: string | null;
  /** Final prepare/sign/broadcast is allowed only when true. */
  canLaunch: boolean;
};

export const SIGN_IN_TO_LAUNCH_MESSAGE =
  'Sign in from the top-right to launch.';

export const EVM_ON_PUMP_MESSAGE =
  'You’re signed in with an Ethereum wallet. Solana launches require a Solana wallet such as Phantom. Sign out from your account and reconnect with a Solana wallet to continue.';

export const SOLANA_ON_PONS_MESSAGE =
  'You’re signed in with a Solana wallet. Robinhood launches require an EVM wallet. Sign out from your account and reconnect with an Ethereum-compatible wallet to continue.';

export const PROVIDER_NOT_READY_MESSAGE =
  'Reconnect your wallet from the top-right Sign In before launching.';

export function getLaunchRailCompatibility(input: {
  selectedRail: LaunchRailKind;
  authenticated: boolean;
  walletNamespace: ScoopWalletNamespace | null;
  authMethod: 'siwe' | 'siws' | null;
  providerReady: boolean;
}): RailCompatibility {
  if (!input.authenticated || !input.walletNamespace || !input.authMethod) {
    return {
      status: 'requires_sign_in',
      message: SIGN_IN_TO_LAUNCH_MESSAGE,
      canLaunch: false,
    };
  }

  const methodMatches =
    (input.walletNamespace === 'eip155' && input.authMethod === 'siwe') ||
    (input.walletNamespace === 'solana' && input.authMethod === 'siws');
  if (!methodMatches) {
    return {
      status: 'requires_sign_in',
      message: SIGN_IN_TO_LAUNCH_MESSAGE,
      canLaunch: false,
    };
  }

  const compatible =
    (input.selectedRail === 'pons' && input.walletNamespace === 'eip155') ||
    (input.selectedRail === 'pump' && input.walletNamespace === 'solana');

  if (!compatible) {
    return {
      status: 'incompatible_namespace',
      message:
        input.selectedRail === 'pump'
          ? EVM_ON_PUMP_MESSAGE
          : SOLANA_ON_PONS_MESSAGE,
      canLaunch: false,
    };
  }

  if (!input.providerReady) {
    return {
      status: 'requires_sign_in',
      message: PROVIDER_NOT_READY_MESSAGE,
      canLaunch: false,
    };
  }

  return { status: 'compatible', message: null, canLaunch: true };
}
