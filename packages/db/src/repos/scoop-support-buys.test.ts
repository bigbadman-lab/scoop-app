import { describe, expect, it, vi } from 'vitest';
import {
  isQualifyingScoopSupportBuy,
  type ScoopSupportBuyAggregate,
} from './scoop-support-buys.js';
import { SCOOP_SUPPORT_WALLET } from '@scoop/shared';

describe('isQualifyingScoopSupportBuy', () => {
  it('accepts exact support wallet buy with positive SOL and tokens', () => {
    expect(
      isQualifyingScoopSupportBuy({
        side: 'buy',
        wallet: SCOOP_SUPPORT_WALLET,
        solAmountLamports: '420000000',
        tokenAmountRaw: '1000000',
      }),
    ).toBe(true);
  });

  it('rejects sells', () => {
    expect(
      isQualifyingScoopSupportBuy({
        side: 'sell',
        wallet: SCOOP_SUPPORT_WALLET,
        solAmountLamports: '420000000',
        tokenAmountRaw: '1000000',
      }),
    ).toBe(false);
  });

  it('rejects other wallets', () => {
    expect(
      isQualifyingScoopSupportBuy({
        side: 'buy',
        wallet: 'So11111111111111111111111111111111111111112',
        solAmountLamports: '420000000',
        tokenAmountRaw: '1000000',
      }),
    ).toBe(false);
  });

  it('rejects lowercased support wallet (Solana is case-sensitive)', () => {
    expect(
      isQualifyingScoopSupportBuy({
        side: 'buy',
        wallet: SCOOP_SUPPORT_WALLET.toLowerCase(),
        solAmountLamports: '420000000',
        tokenAmountRaw: '1000000',
      }),
    ).toBe(false);
  });

  it('rejects zero SOL or zero token amount (transfer/airdrop shape)', () => {
    expect(
      isQualifyingScoopSupportBuy({
        side: 'buy',
        wallet: SCOOP_SUPPORT_WALLET,
        solAmountLamports: '0',
        tokenAmountRaw: '1000000',
      }),
    ).toBe(false);
    expect(
      isQualifyingScoopSupportBuy({
        side: 'buy',
        wallet: SCOOP_SUPPORT_WALLET,
        solAmountLamports: '420000000',
        tokenAmountRaw: '0',
      }),
    ).toBe(false);
  });
});

describe('ScoopSupportBuyAggregate shape', () => {
  it('keeps SOL totals as decimal strings (bigint-safe)', () => {
    const agg: ScoopSupportBuyAggregate = {
      mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      scoopSupportBuyCount: 3,
      scoopSupportTotalSol: '0.77',
      scoopSupportLastBuySol: '0.42',
      scoopSupportLastBuyAt: 1_700_000_000,
      scoopSupportLastSignature: '5'.repeat(64),
    };
    expect(agg.scoopSupportBuyCount).toBe(3);
    expect(agg.scoopSupportTotalSol).toBe('0.77');
    expect(Number.isSafeInteger(Number(agg.scoopSupportLastBuyAt))).toBe(true);
  });
});

describe('upsertScoopSupportBuy SQL contract', () => {
  it('uses ON CONFLICT DO NOTHING and returns inserted=false on replay', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const { upsertScoopSupportBuy } = await import('./scoop-support-buys.js');
    const result = await upsertScoopSupportBuy(
      { query } as never,
      {
        chainId: 900001,
        mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        signature: '5'.repeat(64),
        eventIndex: 0,
        slot: 1,
        blockTime: new Date('2026-09-22T00:00:00.000Z'),
        supportWallet: SCOOP_SUPPORT_WALLET,
        solAmountLamports: '1000',
        solAmount: '0.000001',
        tokenAmountRaw: '1',
        tokenAmount: '0.000001',
        tokenDecimals: 6,
        source: 'alchemy',
      },
    );
    expect(result).toEqual({ inserted: false });
    expect(String(query.mock.calls[0]?.[0])).toContain('ON CONFLICT');
    expect(query.mock.calls[0]?.[1]?.[6]).toBe(SCOOP_SUPPORT_WALLET);
  });
});
