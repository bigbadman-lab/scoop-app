import { describe, expect, it } from 'vitest';
import {
  isEvmAddressShape,
  isSolanaAddressShape,
  normalizeAssetAddress,
  SOLANA_MAINNET_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
} from '@scoop/shared';
import { parseTokenRouteIdentity } from '@/lib/token/token-route-identity';

describe('normalizeAssetAddress', () => {
  it('normalizes EVM addresses unchanged from Robinhood rules', () => {
    expect(
      normalizeAssetAddress({
        chain: 'robinhood',
        address: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      }),
    ).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  });

  it('accepts a valid Solana mint shape and preserves base58', () => {
    const mint = 'So11111111111111111111111111111111111111112';
    expect(normalizeAssetAddress({ chain: 'solana', address: mint })).toBe(mint);
    expect(isSolanaAddressShape(mint)).toBe(true);
    expect(isEvmAddressShape(mint)).toBe(false);
  });

  it('rejects malformed Solana mint', () => {
    expect(() =>
      normalizeAssetAddress({ chain: 'solana', address: '0xdead' }),
    ).toThrow(/Invalid Solana/);
    expect(() =>
      normalizeAssetAddress({ chain: 'solana', address: 'short' }),
    ).toThrow(/Invalid Solana/);
  });
});

describe('parseTokenRouteIdentity', () => {
  it('resolves EVM token to Robinhood chain', () => {
    const id = parseTokenRouteIdentity(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
    expect(id).toEqual({
      kind: 'evm',
      chain: 'robinhood',
      chainId: ROBINHOOD_CHAIN_ID,
      address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  it('resolves Solana mint to product Solana chain', () => {
    const mint = 'So11111111111111111111111111111111111111112';
    const id = parseTokenRouteIdentity(mint);
    expect(id?.kind).toBe('solana');
    expect(id?.chainId).toBe(SOLANA_MAINNET_CHAIN_ID);
    expect(id?.address).toBe(mint);
  });

  it('rejects garbage', () => {
    expect(parseTokenRouteIdentity('not-an-address')).toBeNull();
  });
});
