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
  it('requires sign-in for both rails when disconnected', () => {
    for (const selectedRail of ['pons', 'pump'] as const) {
      const result = getLaunchRailCompatibility({
        selectedRail,
        walletNamespace: null,
        connected: false,
      });
      expect(result.status).toBe('requires_sign_in');
      expect(result.canLaunch).toBe(false);
      expect(result.message).toBe(SIGN_IN_TO_LAUNCH_MESSAGE);
    }
  });

  it('allows PONS and blocks Pump for an EVM session', () => {
    expect(
      getLaunchRailCompatibility({
        selectedRail: 'pons',
        walletNamespace: 'eip155',
        connected: true,
      }).canLaunch,
    ).toBe(true);
    const pump = getLaunchRailCompatibility({
      selectedRail: 'pump',
      walletNamespace: 'eip155',
      connected: true,
    });
    expect(pump.status).toBe('incompatible_namespace');
    expect(pump.canLaunch).toBe(false);
    expect(pump.message).toBe(EVM_ON_PUMP_MESSAGE);
  });

  it('allows Pump and blocks PONS for a Solana session', () => {
    expect(
      getLaunchRailCompatibility({
        selectedRail: 'pump',
        walletNamespace: 'solana',
        connected: true,
      }).canLaunch,
    ).toBe(true);
    const pons = getLaunchRailCompatibility({
      selectedRail: 'pons',
      walletNamespace: 'solana',
      connected: true,
    });
    expect(pons.canLaunch).toBe(false);
    expect(pons.message).toBe(SOLANA_ON_PONS_MESSAGE);
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
