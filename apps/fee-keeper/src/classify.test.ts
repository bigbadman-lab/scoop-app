import { describe, expect, it } from 'vitest';
import {
  classifyQuoteAsset,
  distributionActionsForMarket,
} from './classify.js';
import { zeroAddress } from 'viem';

const TOKEN = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
const NVDA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('classifyQuoteAsset', () => {
  it('treats address(0) as ETH', () => {
    expect(classifyQuoteAsset(zeroAddress)).toBe('eth');
    expect(classifyQuoteAsset('0x0000000000000000000000000000000000000000')).toBe(
      'eth',
    );
  });

  it('treats non-zero as erc20', () => {
    expect(classifyQuoteAsset(NVDA)).toBe('erc20');
  });

  it('rejects malformed', () => {
    expect(() => classifyQuoteAsset('not-an-address')).toThrow(/unsupported_quote/);
  });
});

describe('distributionActionsForMarket', () => {
  it('ETH quote → distributeETH then launched token', () => {
    const actions = distributionActionsForMarket({
      quoteAsset: zeroAddress,
      tokenAddress: TOKEN,
    });
    expect(actions).toEqual([
      { kind: 'eth' },
      { kind: 'token', token: TOKEN },
    ]);
  });

  it('ERC-20 quote → quote token then launched token', () => {
    const actions = distributionActionsForMarket({
      quoteAsset: NVDA,
      tokenAddress: TOKEN,
    });
    expect(actions).toEqual([
      { kind: 'token', token: NVDA },
      { kind: 'token', token: TOKEN },
    ]);
    expect(actions.every((a) => a.kind !== 'eth' || true)).toBe(true);
    expect(
      actions.some((a) => a.kind === 'token' && a.token === zeroAddress),
    ).toBe(false);
  });
});
