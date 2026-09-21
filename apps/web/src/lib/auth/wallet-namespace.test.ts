import { describe, expect, it } from 'vitest';
import {
  filterWalletsByNamespace,
  preferredConnectNamespace,
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

  it('rejects anonymous remote WC wallets for solana without a Solana hint', () => {
    expect(
      walletSupportsNamespace(
        { id: 'wc', isInjected: false, connectors: [] },
        'solana',
      ),
    ).toBe(false);
    expect(
      walletSupportsNamespace(
        { id: 'wc', isInjected: false, connectors: [] },
        'eip155',
      ),
    ).toBe(true);
  });

  it('accepts Phantom even when only eip155 injector is listed', () => {
    expect(
      walletSupportsNamespace(
        {
          id: 'phantom',
          name: 'Phantom',
          isInjected: true,
          connectors: [{ id: 'phantom', chain: 'eip155' }],
        },
        'solana',
      ),
    ).toBe(true);
  });

  it('rejects MetaMask for solana', () => {
    expect(
      walletSupportsNamespace(
        {
          id: 'metamask',
          name: 'MetaMask',
          isInjected: false,
          connectors: [],
        },
        'solana',
      ),
    ).toBe(false);
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
          name: 'MetaMask',
          isInjected: true,
          connectors: [{ id: 'mm', chain: 'eip155' }],
        },
        {
          id: 'ph',
          name: 'Phantom',
          isInjected: true,
          connectors: [{ id: 'ph', chain: 'solana' }],
        },
        { id: 'wc', name: 'Random WC', isInjected: false, connectors: [] },
        {
          id: 'sf',
          name: 'Solflare',
          isInjected: false,
          connectors: [],
        },
      ],
      'solana',
    );
    expect(list.map((w) => w.id)).toEqual(['ph', 'sf']);
  });
});

describe('preferredConnectNamespace', () => {
  it('routes Phantom to solana from the default Sign In list', () => {
    expect(
      preferredConnectNamespace(
        {
          id: 'phantom',
          name: 'Phantom',
          connectors: [{ id: 'phantom', chain: 'eip155' }],
        },
        'eip155',
      ),
    ).toBe('solana');
  });

  it('keeps MetaMask on eip155', () => {
    expect(
      preferredConnectNamespace(
        {
          id: 'metamask',
          name: 'MetaMask',
          connectors: [{ id: 'metamask', chain: 'eip155' }],
        },
        'eip155',
      ),
    ).toBe('eip155');
  });

  it('forces solana when the sheet is already the Solana list', () => {
    expect(
      preferredConnectNamespace(
        { id: 'metamask', name: 'MetaMask' },
        'solana',
      ),
    ).toBe('solana');
  });
});
