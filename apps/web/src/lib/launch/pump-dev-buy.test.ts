import { describe, expect, it } from 'vitest';
import {
  formatSolDevBuySummary,
  parseSolDevBuyLamports,
  requiredSolForPumpLaunch,
  wantsPositiveSolDevBuy,
} from '@/lib/launch/pump-dev-buy';
import { PUMP_MIN_SOL_LAMPORTS } from '@/lib/launch/pump-constants';

describe('parseSolDevBuyLamports', () => {
  it('treats empty / 0 / unset as create-only', () => {
    expect(parseSolDevBuyLamports('')).toEqual({ ok: true, lamports: BigInt(0), human: '0' });
    expect(parseSolDevBuyLamports('0')).toEqual({ ok: true, lamports: BigInt(0), human: '0' });
    expect(parseSolDevBuyLamports('0.000')).toEqual({ ok: true, lamports: BigInt(0), human: '0' });
    expect(wantsPositiveSolDevBuy('')).toBe(false);
    expect(wantsPositiveSolDevBuy('0')).toBe(false);
  });

  it('converts positive SOL with integer-safe lamports', () => {
    expect(parseSolDevBuyLamports('1')).toEqual({
      ok: true,
      lamports: BigInt(1_000_000_000),
      human: '1',
    });
    expect(parseSolDevBuyLamports('0.015')).toEqual({
      ok: true,
      lamports: BigInt(15_000_000),
      human: '0.015',
    });
    expect(wantsPositiveSolDevBuy('0.01')).toBe(true);
  });

  it('rejects negative, malformed, and over-precision', () => {
    expect(parseSolDevBuyLamports('-1').ok).toBe(false);
    expect(parseSolDevBuyLamports('abc').ok).toBe(false);
    expect(parseSolDevBuyLamports('1e-2').ok).toBe(false);
    expect(parseSolDevBuyLamports('0.1234567891').ok).toBe(false);
  });
});

describe('formatSolDevBuySummary', () => {
  it('shows None for zero and amount for positive', () => {
    expect(formatSolDevBuySummary('')).toBe('None');
    expect(formatSolDevBuySummary('0')).toBe('None');
    expect(formatSolDevBuySummary('0.05')).toBe('0.05 SOL');
  });
});

describe('requiredSolForPumpLaunch', () => {
  it('includes create floor + buy + 1% pad + fee buffer', () => {
    const buy = BigInt(100_000_000); // 0.1 SOL
    const need = requiredSolForPumpLaunch(buy);
    // 0.015 + 0.1 + 0.001 + 0.005 = 0.121 SOL
    expect(need).toBe(PUMP_MIN_SOL_LAMPORTS + buy + BigInt(1_000_000) + BigInt(5_000_000));
  });

  it('for zero buy still includes create floor + buffer', () => {
    expect(requiredSolForPumpLaunch(BigInt(0))).toBe(PUMP_MIN_SOL_LAMPORTS + BigInt(5_000_000));
  });
});
