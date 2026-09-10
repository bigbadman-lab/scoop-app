import { describe, expect, it } from 'vitest';
import { foldHolderBalances } from '@scoop/shared';

describe('holder balance audit', () => {
  it('handles mint, transfer, burn, and full balance exit', () => {
    const tokenHolder = '0x1111111111111111111111111111111111111111';
    const other = '0x2222222222222222222222222222222222222222';
    const zero = '0x0000000000000000000000000000000000000000';

    const folded = foldHolderBalances([
      { from: zero, to: tokenHolder, amount: 1000n, blockNumber: 1 },
      { from: tokenHolder, to: other, amount: 400n, blockNumber: 2 },
      { from: other, to: tokenHolder, amount: 100n, blockNumber: 3 },
      { from: tokenHolder, to: zero, amount: 200n, blockNumber: 4 },
      { from: tokenHolder, to: other, amount: 500n, blockNumber: 5 },
    ]);

    const byAddr = new Map(folded.map((h) => [h.address, h.balanceRaw]));
    expect(byAddr.has(tokenHolder.toLowerCase())).toBe(false); // zero omitted
    expect(byAddr.get(other.toLowerCase())).toBe(800n);
  });

  it('handles multiple transfers to same holder', () => {
    const a = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const b = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const zero = '0x0000000000000000000000000000000000000000';
    const folded = foldHolderBalances([
      { from: zero, to: a, amount: 10n, blockNumber: 1 },
      { from: a, to: b, amount: 3n, blockNumber: 2 },
      { from: a, to: b, amount: 2n, blockNumber: 3 },
    ]);
    const byAddr = new Map(folded.map((h) => [h.address, h.balanceRaw]));
    expect(byAddr.get(a)).toBe(5n);
    expect(byAddr.get(b)).toBe(5n);
  });
});

/**
 * CRITICAL: holder_balances is latest-state only.
 * Historical hourly snapshots for the P8 holder worker require reconstructing
 * from `transfers` (or a dedicated snapshot table) at a deterministic block.
 * Current balances ≠ historical Merkle inputs.
 */
describe('holder snapshot readiness', () => {
  it('documents latest-state-only (transfers are the reconstruction source)', () => {
    expect(typeof foldHolderBalances).toBe('function');
  });
});
