import { describe, expect, it } from 'vitest';
import { parseEther, zeroAddress } from 'viem';
import {
  computeMinTokensOut,
  formatEthWei,
  isNativeEthQuote,
  parseEthDevBuyWei,
  resolveDevBuyIntent,
  selectLaunchFunction,
  LAUNCH_DEV_BUY_SLIPPAGE_BPS,
} from '@/lib/launch/dev-buy';
import { createInitialLaunchState } from '@/lib/launch/types';
import { minimumAmountOut } from '@/lib/trade/slippage';

const USDG = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

describe('dev-buy selection and units', () => {
  it('selects launch for zero buy', () => {
    expect(
      selectLaunchFunction({
        quoteAsset: zeroAddress,
        quoteAmountInWei: BigInt(0),
      }),
    ).toBe('launch');
  });

  it('selects launchAndBuy for positive ETH buy', () => {
    expect(
      selectLaunchFunction({
        quoteAsset: zeroAddress,
        quoteAmountInWei: parseEther('0.01'),
      }),
    ).toBe('launchAndBuy');
  });

  it('does not select launchAndBuy for ERC-20 even if amount > 0', () => {
    // Guard: caller must reject before this; selection still returns launch.
    expect(
      selectLaunchFunction({
        quoteAsset: USDG,
        quoteAmountInWei: parseEther('0.01'),
      }),
    ).toBe('launch');
  });

  it('parses ETH decimals to wei without float', () => {
    expect(parseEthDevBuyWei('0.01')).toEqual({
      ok: true,
      wei: parseEther('0.01'),
    });
    expect(parseEthDevBuyWei('')).toEqual({ ok: true, wei: BigInt(0) });
    expect(parseEthDevBuyWei('0')).toEqual({ ok: true, wei: BigInt(0) });
  });

  it('rejects malformed and oversized ETH amounts', () => {
    expect(parseEthDevBuyWei('1e-2').ok).toBe(false);
    expect(parseEthDevBuyWei('-1').ok).toBe(false);
    expect(parseEthDevBuyWei('0.1234567890123456789').ok).toBe(false);
    expect(parseEthDevBuyWei('101').ok).toBe(false);
  });

  it('resolveDevBuyIntent rejects non-ETH positive buy', () => {
    const state = createInitialLaunchState({
      quoteAsset: USDG,
      quoteSymbol: 'USDG',
      devBuyAmount: '1',
    });
    const result = resolveDevBuyIntent(state, USDG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ETH pairs only/i);
    }
  });

  it('resolveDevBuyIntent maps blank/zero to launch', () => {
    const state = createInitialLaunchState({
      quoteAsset: zeroAddress,
      quoteSymbol: 'ETH',
      devBuyAmount: '',
    });
    const result = resolveDevBuyIntent(state, zeroAddress);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.functionName).toBe('launch');
      expect(result.msgValueWei(parseEther('0.0005'))).toBe(parseEther('0.0005'));
    }
  });

  it('resolveDevBuyIntent maps ETH buy to fee + quote', () => {
    const state = createInitialLaunchState({
      quoteAsset: zeroAddress,
      quoteSymbol: 'ETH',
      devBuyAmount: '0.01',
    });
    const result = resolveDevBuyIntent(state, zeroAddress);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.functionName).toBe('launchAndBuy');
      expect(result.quoteAmountInWei).toBe(parseEther('0.01'));
      expect(result.msgValueWei(parseEther('0.0005'))).toBe(
        parseEther('0.0105'),
      );
    }
  });

  it('isNativeEthQuote recognizes zero address', () => {
    expect(isNativeEthQuote(zeroAddress)).toBe(true);
    expect(isNativeEthQuote(USDG)).toBe(false);
  });

  it('computeMinTokensOut applies DEFAULT_SLIPPAGE_BPS', () => {
    const expected = BigInt(10_000);
    const min = computeMinTokensOut(expected);
    expect(min).toBe(minimumAmountOut(expected, LAUNCH_DEV_BUY_SLIPPAGE_BPS));
    expect(min).toBe(BigInt(9900));
  });

  it('rejects zero expected output', () => {
    expect(() => computeMinTokensOut(BigInt(0))).toThrow(/positive/i);
  });

  it('formatEthWei preserves totals for display', () => {
    expect(formatEthWei(parseEther('0.0105'))).toBe('0.0105');
    expect(formatEthWei(parseEther('0.0005'))).toBe('0.0005');
  });
});
