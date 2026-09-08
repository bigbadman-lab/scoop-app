/**
 * MVP on-chain policy: embedded/email wallets may browse and manage profile,
 * but must not broadcast launch/buy/sell through the embedded signer.
 */
export type OnChainWalletCapability = {
  mayBroadcastOnChain: boolean;
  reason: 'external_ok' | 'embedded_blocked' | 'unsigned';
  message: string | null;
};

export function resolveOnChainWalletCapability(input: {
  authenticated: boolean;
  walletType?: 'external' | 'embedded' | null;
}): OnChainWalletCapability {
  if (!input.authenticated) {
    return {
      mayBroadcastOnChain: false,
      reason: 'unsigned',
      message: 'Connect an external wallet to continue.',
    };
  }
  if (input.walletType === 'embedded') {
    return {
      mayBroadcastOnChain: false,
      reason: 'embedded_blocked',
      message: 'Connect an external wallet to continue on-chain.',
    };
  }
  return {
    mayBroadcastOnChain: true,
    reason: 'external_ok',
    message: null,
  };
}
