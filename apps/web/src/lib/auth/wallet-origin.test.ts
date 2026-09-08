import { describe, expect, it } from 'vitest';
import {
  isEmbeddedWalletAccount,
  resolveSiweWalletMeta,
} from '@/lib/auth/wallet-origin';
import { resolveEmbeddedExportAvailability } from '@/lib/auth/embedded-wallet-export';

describe('wallet-origin', () => {
  it('marks AUTH + email as embedded reown_email', () => {
    expect(
      resolveSiweWalletMeta({
        connectorId: 'AUTH',
        embeddedWalletInfo: { authProvider: 'email' },
      }),
    ).toEqual({ walletType: 'embedded', provider: 'reown_email' });
  });

  it('marks unknown connectors as external', () => {
    expect(
      resolveSiweWalletMeta({
        connectorId: 'io.metamask',
        embeddedWalletInfo: undefined,
      }),
    ).toEqual({ walletType: 'external', provider: 'unknown' });
  });

  it('treats live AUTH as embedded even when stored as external', () => {
    expect(
      isEmbeddedWalletAccount({
        storedWalletType: 'external',
        connectorId: 'AUTH',
        hasEmbeddedWalletInfo: true,
      }),
    ).toBe(true);
  });
});

describe('resolveEmbeddedExportAvailability live fallback', () => {
  it('shows Export ready for live email AUTH even if DB walletType is external', () => {
    expect(
      resolveEmbeddedExportAvailability({
        walletType: 'external',
        sessionOnly: false,
        connectorId: 'AUTH',
        hasEmbeddedWalletInfo: true,
      }),
    ).toBe('ready');
  });

  it('stays hidden for true external wallets', () => {
    expect(
      resolveEmbeddedExportAvailability({
        walletType: 'external',
        sessionOnly: false,
        connectorId: 'io.metamask',
        hasEmbeddedWalletInfo: false,
      }),
    ).toBe('hidden');
  });
});
