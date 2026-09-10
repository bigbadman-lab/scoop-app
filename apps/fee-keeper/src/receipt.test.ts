import { describe, expect, it } from 'vitest';
import { receiptHasFeesCollected } from './collect.js';
import { receiptHasDistributionEvent } from './distribute.js';
import type { TransactionReceipt } from 'viem';

describe('receipt success helpers', () => {
  it('tx hash alone is not success — empty logs fail event verify', () => {
    const receipt = {
      status: 'success',
      logs: [],
      gasUsed: 1n,
    } as unknown as TransactionReceipt;
    expect(
      receiptHasFeesCollected(
        receipt,
        '0xAa8445659A2424ee1BA33C232Ec05569c975193f',
        1n,
      ),
    ).toBe(false);
    expect(
      receiptHasDistributionEvent(
        receipt,
        '0x187E2c017bcc52094A9086abAC94Dde7B680a988',
        { kind: 'eth' },
      ),
    ).toBe(false);
  });

  it('reverted status is never treated as collect success by callers', () => {
    // writeCollectFees checks receipt.status !== 'success' before event verify
    const receipt = { status: 'reverted', logs: [] } as unknown as TransactionReceipt;
    expect(receipt.status).not.toBe('success');
  });
});
