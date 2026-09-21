import { describe, expect, it } from 'vitest';
import {
  EVM_ON_PUMP_MESSAGE,
  SIGN_IN_TO_LAUNCH_MESSAGE,
  SOLANA_ON_PONS_MESSAGE,
  getLaunchRailCompatibility,
} from '@/lib/launch/rail-compatibility';
import { resolveScoopWalletSession } from '@/lib/auth/wallet-session';

const SOL = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

describe('getLaunchRailCompatibility', () => {
  const signedOut = {
    authenticated: false,
    walletNamespace: null,
    authMethod: null,
    providerReady: false,
  } as const;

  it('requires sign-in for both rails when disconnected', () => {
    for (const selectedRail of ['pons', 'pump'] as const) {
      const result = getLaunchRailCompatibility({
        selectedRail,
        ...signedOut,
      });
      expect(result.status).toBe('requires_sign_in');
      expect(result.canLaunch).toBe(false);
      expect(result.message).toBe(SIGN_IN_TO_LAUNCH_MESSAGE);
    }
  });

  it('allows PONS and blocks Pump for an EVM SIWE session', () => {
    expect(
      getLaunchRailCompatibility({
        selectedRail: 'pons',
        authenticated: true,
        walletNamespace: 'eip155',
        authMethod: 'siwe',
        providerReady: true,
      }).canLaunch,
    ).toBe(true);
    const pump = getLaunchRailCompatibility({
      selectedRail: 'pump',
      authenticated: true,
      walletNamespace: 'eip155',
      authMethod: 'siwe',
      providerReady: true,
    });
    expect(pump.status).toBe('incompatible_namespace');
    expect(pump.canLaunch).toBe(false);
    expect(pump.message).toBe(EVM_ON_PUMP_MESSAGE);
  });

  it('allows Pump and blocks PONS for a Solana SIWS session', () => {
    expect(
      getLaunchRailCompatibility({
        selectedRail: 'pump',
        authenticated: true,
        walletNamespace: 'solana',
        authMethod: 'siws',
        providerReady: true,
      }).canLaunch,
    ).toBe(true);
    const pons = getLaunchRailCompatibility({
      selectedRail: 'pons',
      authenticated: true,
      walletNamespace: 'solana',
      authMethod: 'siws',
      providerReady: true,
    });
    expect(pons.canLaunch).toBe(false);
    expect(pons.message).toBe(SOLANA_ON_PONS_MESSAGE);
  });

  it('does not allow Pump from a connected Solana wallet that has not completed SIWS', () => {
    const pump = getLaunchRailCompatibility({
      selectedRail: 'pump',
      authenticated: false,
      walletNamespace: 'solana',
      authMethod: null,
      providerReady: true,
    });
    expect(pump.canLaunch).toBe(false);
    expect(pump.status).toBe('requires_sign_in');
  });
});

describe('resolveScoopWalletSession', () => {
  it('keeps an explicit Solana choice when both chains are connected', () => {
    const session = resolveScoopWalletSession({
      authoritative: 'solana',
      evmConnected: true,
      evmAddress: EVM,
      solanaConnected: true,
      solanaAddress: SOL,
      solanaProviderReady: true,
    });
    expect(session).toEqual({
      connected: true,
      namespace: 'solana',
      address: SOL,
      providerReady: true,
    });
  });

  it('does not switch namespace when the rail would prefer the other chain', () => {
    const evm = resolveScoopWalletSession({
      authoritative: 'eip155',
      evmConnected: true,
      evmAddress: EVM,
      solanaConnected: true,
      solanaAddress: SOL,
      solanaProviderReady: true,
    });
    expect(evm.namespace).toBe('eip155');
    expect(evm.address).toBe(EVM);
  });

  it('clears when the authoritative chain disconnects', () => {
    const session = resolveScoopWalletSession({
      authoritative: 'solana',
      evmConnected: true,
      evmAddress: EVM,
      solanaConnected: false,
      solanaAddress: null,
      solanaProviderReady: false,
    });
    expect(session.connected).toBe(false);
    expect(session.namespace).toBeNull();
  });
});
