import { describe, expect, it } from 'vitest';
import { parseEther, parseUnits, zeroAddress } from 'viem';
import { claimAssetKey, formatClaimAmount } from './format';

describe('formatClaimAmount', () => {
  it('formats ETH with bigint-safe formatEther path', () => {
    expect(formatClaimAmount(parseEther('0.0000145949'), 18)).toBe('0.000014');
    expect(formatClaimAmount(0n, 18)).toBe('0');
  });

  it('respects non-18 token decimals', () => {
    expect(formatClaimAmount(parseUnits('3407.9241', 6), 6)).toBe('3407.9241');
    expect(formatClaimAmount(1_000_000n, 6)).toBe('1');
  });

  it('does not coerce raw to Number before formatting', () => {
    const huge = 10n ** 30n;
    const out = formatClaimAmount(huge, 18);
    expect(out).toContain('1000000000000');
    expect(Number.isFinite(Number(out)) || out.includes('.')).toBe(true);
  });
});

describe('claimAssetKey', () => {
  it('keys eth and token distinctly', () => {
    expect(
      claimAssetKey({
        kind: 'eth',
        assetAddress: zeroAddress,
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
      }),
    ).toBe(`eth:${zeroAddress}`);
    expect(
      claimAssetKey({
        kind: 'token',
        assetAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        symbol: 'AMZN',
        name: 'AMZN',
        decimals: 18,
      }),
    ).toBe('token:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });
});
