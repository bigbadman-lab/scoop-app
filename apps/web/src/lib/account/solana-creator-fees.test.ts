import { describe, expect, it } from 'vitest';
import {
  claimableUsdDisplay,
  lamportsToSolDisplay,
  mapCreatorFeeError,
} from '@/lib/account/solana-creator-fees';

describe('lamportsToSolDisplay', () => {
  it('formats whole and fractional SOL', () => {
    expect(lamportsToSolDisplay(BigInt(0))).toBe('0');
    expect(lamportsToSolDisplay(BigInt(1_000_000_000))).toBe('1');
    expect(lamportsToSolDisplay(BigInt(1_500_000_000))).toBe('1.5');
    expect(lamportsToSolDisplay(BigInt(1))).toBe('0.000000001');
  });
});

describe('claimableUsdDisplay', () => {
  it('returns null without SOL/USD or zero lamports', () => {
    expect(claimableUsdDisplay(BigInt(1_000_000_000), null)).toBeNull();
    expect(
      claimableUsdDisplay(BigInt(0), BigInt(150) * BigInt(10) ** BigInt(18)),
    ).toBeNull();
  });

  it('formats approximate USD from x18 SOL price', () => {
    // 1 SOL × $150
    expect(
      claimableUsdDisplay(BigInt(1_000_000_000), BigInt(150) * BigInt(10) ** BigInt(18)),
    ).toBe('$150.00');
  });
});

describe('mapCreatorFeeError', () => {
  it('maps known codes', () => {
    expect(mapCreatorFeeError(new Error('fee_sharing_unsupported')).code).toBe(
      'fee_sharing_unsupported',
    );
    expect(mapCreatorFeeError(new Error('nothing_to_claim')).code).toBe(
      'nothing_to_claim',
    );
  });
});
