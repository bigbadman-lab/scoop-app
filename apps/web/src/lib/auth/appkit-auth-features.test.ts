import { describe, expect, it } from 'vitest';
import { resolveOnChainWalletCapability } from '@/lib/account/onchain-policy';
import {
  buildScoopAppKitDefaultAccountTypes,
  buildScoopAppKitFeatures,
} from '@/lib/auth/appkit-auth-features';
import { robinhoodAppKitChain } from '@/lib/auth/chain';
import { ROBINHOOD_CHAIN_ID } from '@/lib/brand';
import { isScoopReownEmailProofEnabled } from '@/lib/auth/reown-email-proof';

describe('buildScoopAppKitFeatures', () => {
  it('enables email login without the dev email-proof flag', () => {
    const features = buildScoopAppKitFeatures();
    expect(features.email).toBe(true);
    expect(features.emailShowWallets).toBe(true);
    expect(isScoopReownEmailProofEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('keeps wallet login visible and socials off', () => {
    const features = buildScoopAppKitFeatures();
    expect(features.emailShowWallets).toBe(true);
    expect(features.socials).toBe(false);
    expect(features.analytics).toBe(false);
  });

  it('prefers EOA for embedded email wallets', () => {
    expect(buildScoopAppKitDefaultAccountTypes()).toEqual({ eip155: 'eoa' });
  });
});

describe('AppKit chain config', () => {
  it('keeps Robinhood Chain 4663 as the AppKit network', () => {
    expect(ROBINHOOD_CHAIN_ID).toBe(4663);
    expect(robinhoodAppKitChain.id).toBe(4663);
  });
});

describe('launch/trade wallet gating (unchanged)', () => {
  it('still blocks embedded email wallets from on-chain broadcast', () => {
    const result = resolveOnChainWalletCapability({
      authenticated: true,
      walletType: 'embedded',
    });
    expect(result.mayBroadcastOnChain).toBe(false);
    expect(result.reason).toBe('embedded_blocked');
  });

  it('still allows external wallets for on-chain broadcast', () => {
    const result = resolveOnChainWalletCapability({
      authenticated: true,
      walletType: 'external',
    });
    expect(result.mayBroadcastOnChain).toBe(true);
    expect(result.reason).toBe('external_ok');
  });
});
