import { describe, expect, it } from 'vitest';
import {
  filterWalletsByNamespace,
  walletSupportsNamespace,
} from '@/lib/auth/wallet-namespace';

describe('walletSupportsNamespace', () => {
  it('accepts injected wallet with matching connector chain', () => {
    expect(
      walletSupportsNamespace(
        {
          id: 'phantom',
          isInjected: true,
          connectors: [{ id: 'phantom', chain: 'solana' }],
        },
        'solana',
      ),
    ).toBe(true);
  });

  it('rejects injected EVM-only wallet for solana', () => {
    expect(
      walletSupportsNamespace(
        {
          id: 'metamask',
          isInjected: true,
          connectors: [{ id: 'metamask', chain: 'eip155' }],
        },
        'solana',
      ),
    ).toBe(false);
  });

  it('accepts remote WC wallets without connectors for either namespace', () => {
    expect(
      walletSupportsNamespace(
        { id: 'wc', isInjected: false, connectors: [] },
        'solana',
      ),
    ).toBe(true);
    expect(
      walletSupportsNamespace(
        { id: 'wc', isInjected: false, connectors: [] },
        'eip155',
      ),
    ).toBe(true);
  });

  it('uses supportedNamespaces when present', () => {
    expect(
      walletSupportsNamespace(
        {
          id: 'multi',
          isInjected: false,
          connectors: [],
          walletInfo: { supportedNamespaces: ['solana'] },
        },
        'solana',
      ),
    ).toBe(true);
  });
});

describe('filterWalletsByNamespace', () => {
  it('keeps Solana-capable wallets only', () => {
    const list = filterWalletsByNamespace(
      [
        {
          id: 'mm',
          isInjected: true,
          connectors: [{ id: 'mm', chain: 'eip155' }],
        },
        {
          id: 'ph',
          isInjected: true,
          connectors: [{ id: 'ph', chain: 'solana' }],
        },
        { id: 'wc', isInjected: false, connectors: [] },
      ],
      'solana',
    );
    expect(list.map((w) => w.id)).toEqual(['ph', 'wc']);
  });
});
