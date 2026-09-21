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

export const EVM_ON_PUMP_MESSAGE =
  'You’re signed in with an Ethereum wallet. Solana launches require a Solana wallet such as Phantom. Sign out and reconnect with a Solana wallet to continue.';

export const SOLANA_ON_PONS_MESSAGE =
  'You’re signed in with a Solana wallet. Robinhood launches require an EVM wallet. Sign out and reconnect with an Ethereum-compatible wallet to continue.';

export const SIGN_IN_TO_LAUNCH_MESSAGE = 'Sign in to launch.';

export function getLaunchRailCompatibility(input: {
  selectedRail: LaunchRailKind;
  walletNamespace: ScoopWalletNamespace | null;
  connected: boolean;
}): RailCompatibility {
  if (!input.connected || !input.walletNamespace) {
    return {
      status: 'requires_sign_in',
      message: SIGN_IN_TO_LAUNCH_MESSAGE,
      canLaunch: false,
    };
  }

  const compatible =
    (input.selectedRail === 'pons' && input.walletNamespace === 'eip155') ||
    (input.selectedRail === 'pump' && input.walletNamespace === 'solana');

  if (compatible) {
    return { status: 'compatible', message: null, canLaunch: true };
  }

  return {
    status: 'incompatible_namespace',
    message:
      input.selectedRail === 'pump'
        ? EVM_ON_PUMP_MESSAGE
        : SOLANA_ON_PONS_MESSAGE,
    canLaunch: false,
  };
}
