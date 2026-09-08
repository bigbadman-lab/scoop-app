import { describe, expect, it, vi } from 'vitest';
import {
  EMBEDDED_WALLET_EXPORT_ERROR,
  openEmbeddedWalletExport,
  resolveEmbeddedExportAvailability,
} from '@/lib/auth/embedded-wallet-export';

describe('resolveEmbeddedExportAvailability', () => {
  it('hides export for external wallets', () => {
    expect(
      resolveEmbeddedExportAvailability({
        walletType: 'external',
        sessionOnly: false,
        connectorId: 'injected',
      }),
    ).toBe('hidden');
  });

  it('is ready for embedded + AUTH connector', () => {
    expect(
      resolveEmbeddedExportAvailability({
        walletType: 'embedded',
        sessionOnly: false,
        connectorId: 'AUTH',
      }),
    ).toBe('ready');
  });

  it('requires reconnect when session-only embedded', () => {
    expect(
      resolveEmbeddedExportAvailability({
        walletType: 'embedded',
        sessionOnly: true,
        connectorId: undefined,
      }),
    ).toBe('reconnect');
  });

  it('requires reconnect when connected without AUTH', () => {
    expect(
      resolveEmbeddedExportAvailability({
        walletType: 'embedded',
        sessionOnly: false,
        connectorId: 'io.metamask',
      }),
    ).toBe('reconnect');
  });
});

describe('openEmbeddedWalletExport', () => {
  it('opens UpgradeEmailWallet path first', async () => {
    const openUpgradeView = vi.fn().mockResolvedValue(undefined);
    const openAccountView = vi.fn();
    await expect(
      openEmbeddedWalletExport({ openUpgradeView, openAccountView }),
    ).resolves.toBe('upgrade');
    expect(openUpgradeView).toHaveBeenCalledTimes(1);
    expect(openAccountView).not.toHaveBeenCalled();
  });

  it('falls back to Account view when upgrade fails', async () => {
    const openUpgradeView = vi.fn().mockRejectedValue(new Error('unavailable'));
    const openAccountView = vi.fn().mockResolvedValue(undefined);
    await expect(
      openEmbeddedWalletExport({ openUpgradeView, openAccountView }),
    ).resolves.toBe('account');
    expect(openAccountView).toHaveBeenCalledTimes(1);
  });

  it('returns error when both paths fail', async () => {
    const openUpgradeView = vi.fn().mockRejectedValue(new Error('upgrade'));
    const openAccountView = vi.fn().mockRejectedValue(new Error('account'));
    await expect(
      openEmbeddedWalletExport({ openUpgradeView, openAccountView }),
    ).resolves.toBe('error');
    expect(EMBEDDED_WALLET_EXPORT_ERROR).toMatch(/couldn't open wallet export/i);
  });

  it('never accepts or returns key material', async () => {
    const openUpgradeView = vi.fn().mockResolvedValue({ privateKey: '0xdead' });
    const result = await openEmbeddedWalletExport({
      openUpgradeView,
      openAccountView: vi.fn(),
    });
    expect(result).toBe('upgrade');
    expect(result).not.toEqual(expect.objectContaining({ privateKey: expect.anything() }));
  });
});
