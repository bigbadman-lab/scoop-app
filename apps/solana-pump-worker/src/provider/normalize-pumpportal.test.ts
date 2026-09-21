import { describe, expect, it } from 'vitest';
import {
  coercePositiveDecimalString,
  decimalStringToRaw,
  deterministicEventIndex,
  normalizePumpPortalTrade,
  priceSolFromAmounts,
  classifyPumpPortalProviderError,
} from './normalize-pumpportal.js';

const MINT = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SIG = '5'.repeat(64);
const TRADER = 'So11111111111111111111111111111111111111112';

describe('normalizePumpPortalTrade', () => {
  it('maps a valid buy', () => {
    const result = normalizePumpPortalTrade(
      {
        mint: MINT,
        signature: SIG,
        txType: 'buy',
        tokenAmount: '1000000',
        solAmount: '0.5',
        traderPublicKey: TRADER,
        bondingCurveKey: '43qMNRPVo1oB8XYc9YZRuN9fKYSn782X5TnreNKWgS5b',
      },
      { receivedAt: new Date('2026-09-21T12:00:00.000Z') },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.side).toBe('buy');
    expect(result.event.source).toBe('pumpportal');
    expect(result.event.mint).toBe(MINT);
    expect(result.event.solAmount).toBe('0.5');
    expect(result.event.solAmountLamports).toBe('500000000');
    expect(result.event.tokenAmountRaw).toBe('1000000000000'); // 1e6 * 1e6
    expect(result.event.priceSol).toBe(priceSolFromAmounts('0.5', '1000000'));
    expect(result.event.curveAddress).toBe('43qMNRPVo1oB8XYc9YZRuN9fKYSn782X5TnreNKWgS5b');
    expect(result.event.eventIndex).toBe(
      deterministicEventIndex({
        signature: SIG,
        mint: MINT,
        txType: 'buy',
        solAmount: '0.5',
        tokenAmount: '1000000',
        trader: TRADER,
      }),
    );
  });

  it('maps a valid sell', () => {
    const result = normalizePumpPortalTrade({
      mint: MINT,
      signature: 'a'.repeat(64),
      txType: 'sell',
      tokenAmount: '10',
      solAmount: '0.01',
      traderPublicKey: TRADER,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.side).toBe('sell');
  });

  it('maps PumpSwap-style pool field into curveAddress', () => {
    const pool = '9gZy7eAASMkgTBbP1TnBXP65ysb7CYLyBQznapc886Rn';
    const result = normalizePumpPortalTrade({
      mint: MINT,
      signature: 'b'.repeat(64),
      txType: 'buy',
      tokenAmount: '1',
      solAmount: '0.1',
      traderPublicKey: TRADER,
      pool,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.curveAddress).toBe(pool);
    expect(result.event.poolHint).toBe(pool);
  });

  it('rejects invalid mint', () => {
    const result = normalizePumpPortalTrade({
      mint: '0x' + 'a'.repeat(40),
      signature: SIG,
      txType: 'buy',
      tokenAmount: '1',
      solAmount: '1',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects malformed numeric values', () => {
    const result = normalizePumpPortalTrade({
      mint: MINT,
      signature: SIG,
      txType: 'buy',
      tokenAmount: 'nope',
      solAmount: '1',
    });
    expect(result.ok).toBe(false);
  });

  it('ignores unknown / non-trade message types safely', () => {
    expect(normalizePumpPortalTrade({ hello: 'world' }).ok).toBe(false);
    expect(normalizePumpPortalTrade({ txType: 'create', mint: MINT }).ok).toBe(false);
  });

  it('uses provider eventIndex when present', () => {
    const result = normalizePumpPortalTrade({
      mint: MINT,
      signature: SIG,
      txType: 'buy',
      tokenAmount: '1',
      solAmount: '1',
      eventIndex: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.eventIndex).toBe(3);
  });
});

describe('decimal helpers', () => {
  it('decimalStringToRaw preserves integer scale', () => {
    expect(decimalStringToRaw('1.5', 9)).toBe('1500000000');
    expect(decimalStringToRaw('0.5', 9)).toBe('500000000');
  });

  it('coercePositiveDecimalString rejects negatives', () => {
    expect(() => coercePositiveDecimalString(-1, 'x')).toThrow();
  });
});

describe('classifyPumpPortalProviderError', () => {
  it('detects auth and funding blocks', () => {
    expect(classifyPumpPortalProviderError('Invalid API key').status).toBe('blocked_auth');
    expect(classifyPumpPortalProviderError('wallet must be funded with 0.02 SOL').status).toBe(
      'blocked_funding',
    );
  });
});
