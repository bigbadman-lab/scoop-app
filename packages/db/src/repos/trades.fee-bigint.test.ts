import { describe, expect, it, vi } from 'vitest';
import { toNumericString } from '../hex.js';
import { upsertTrade } from './trades.js';

const OVERFLOW_FEE_WEI = '6767803800000000';

describe('upsertTrade fee bigint safety', () => {
  it('preserves wei-sized Pons fee exactly (PG integer overflow regression)', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await upsertTrade({ query } as never, {
      chainId: 4663,
      txHash: `0x${'ab'.repeat(32)}`,
      logIndex: 3,
      blockNumber: 69_000_000n,
      blockHash: `0x${'cd'.repeat(32)}`,
      blockTimestamp: 1_700_000_000n,
      poolId: `0x${'11'.repeat(32)}`,
      tokenAddress: '0x2222222222222222222222222222222222222222',
      quoteAsset: '0x0000000000000000000000000000000000000000',
      swapSender: '0x3333333333333333333333333333333333333333',
      traderAttributionType: 'curve_buy',
      side: 'buy',
      amount0Raw: 0n,
      amount1Raw: 0n,
      quoteAmountRaw: 100n,
      tokenAmountRaw: 1000n,
      sqrtPriceX96After: 0n,
      tickAfter: 0,
      liquidityAfterRaw: 0n,
      fee: BigInt(OVERFLOW_FEE_WEI),
      executionPriceQuoteX18: 1n,
    });

    const params = query.mock.calls[0]![1] as unknown[];
    // fee is parameter index 21 (0-based) in upsertTrade VALUES list
    expect(params[21]).toBe(OVERFLOW_FEE_WEI);
    expect(toNumericString(BigInt(OVERFLOW_FEE_WEI))).toBe(OVERFLOW_FEE_WEI);
    // Prove the value exceeds PostgreSQL integer max but is a valid bigint decimal.
    expect(BigInt(OVERFLOW_FEE_WEI) > 2147483647n).toBe(true);
    expect(Number.isSafeInteger(Number(OVERFLOW_FEE_WEI))).toBe(true);
  });
});
