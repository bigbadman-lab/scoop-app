import { describe, expect, it } from 'vitest';
import { parseEther, parseUnits, zeroAddress } from 'viem';
import {
  computeMinTokensOut,
  formatEthWei,
  formatQuoteRaw,
  isNativeEthQuote,
  parseDevBuyAmount,
  parseEthDevBuyWei,
  resolveDevBuyIntent,
  selectLaunchFunction,
  LAUNCH_DEV_BUY_SLIPPAGE_BPS,
} from '@/lib/launch/dev-buy';
import { computeLaunchAndBuyMsgValue } from '@/lib/launch/execute';
import { createInitialLaunchState } from '@/lib/launch/types';
import { minimumAmountOut } from '@/lib/trade/slippage';

const USDG = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const AAPL = '0x1111111111111111111111111111111111111111';

describe('dev-buy selection and units', () => {
  it('selects launch for zero buy (ETH)', () => {
    expect(
      selectLaunchFunction({
        quoteAsset: zeroAddress,
        quoteAmountIn: BigInt(0),
      }),
    ).toBe('launch');
  });

  it('selects launchAndBuy for positive ETH buy', () => {
    expect(
      selectLaunchFunction({
        quoteAsset: zeroAddress,
        quoteAmountIn: parseEther('0.01'),
      }),
    ).toBe('launchAndBuy');
  });

  it('selects launchAndBuy for positive ERC-20 buy', () => {
    expect(
      selectLaunchFunction({
        quoteAsset: USDG,
        quoteAmountIn: parseUnits('10', 6),
      }),
    ).toBe('launchAndBuy');
  });

  it('parses ETH decimals to wei without float', () => {
    expect(parseEthDevBuyWei('0.01')).toEqual({
      ok: true,
      amount: parseEther('0.01'),
      wei: parseEther('0.01'),
    });
    expect(parseEthDevBuyWei('')).toEqual({
      ok: true,
      amount: BigInt(0),
      wei: BigInt(0),
    });
    expect(parseEthDevBuyWei('0')).toEqual({
      ok: true,
      amount: BigInt(0),
      wei: BigInt(0),
    });
  });

  it('rejects malformed and oversized ETH amounts', () => {
    expect(parseEthDevBuyWei('1e-2').ok).toBe(false);
    expect(parseEthDevBuyWei('-1').ok).toBe(false);
    expect(parseEthDevBuyWei('0.1234567890123456789').ok).toBe(false);
    expect(parseEthDevBuyWei('101').ok).toBe(false);
  });

  it('parses USDG with 6 decimals and does not apply 100 ETH soft max', () => {
    const parsed = parseDevBuyAmount({
      raw: '250',
      decimals: 6,
      quoteSymbol: 'USDG',
      quoteAsset: USDG,
    });
    expect(parsed).toEqual({
      ok: true,
      amount: parseUnits('250', 6),
      wei: parseUnits('250', 6),
    });
  });

  it('parses stock quote decimals without hardcoding symbol', () => {
    const parsed = parseDevBuyAmount({
      raw: '1.5',
      decimals: 18,
      quoteSymbol: 'AAPL',
      quoteAsset: AAPL,
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.amount).toBe(parseUnits('1.5', 18));
    }
  });

  it('rejects too many fractional digits for quote decimals', () => {
    expect(
      parseDevBuyAmount({
        raw: '1.1234567',
        decimals: 6,
        quoteSymbol: 'USDG',
        quoteAsset: USDG,
      }).ok,
    ).toBe(false);
  });

  it('resolveDevBuyIntent requires decimals for ERC-20 buy', () => {
    const state = createInitialLaunchState({
      quoteAsset: USDG,
      quoteSymbol: 'USDG',
      quoteDecimals: null,
      devBuyAmount: '1',
    });
    const result = resolveDevBuyIntent(state, USDG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/decimals/i);
    }
  });

  it('resolveDevBuyIntent maps blank/zero to launch', () => {
    const state = createInitialLaunchState({
      quoteAsset: zeroAddress,
      quoteSymbol: 'ETH',
      quoteDecimals: 18,
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
      quoteDecimals: 18,
      devBuyAmount: '0.01',
    });
    const result = resolveDevBuyIntent(state, zeroAddress);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.functionName).toBe('launchAndBuy');
      expect(result.quoteAmountIn).toBe(parseEther('0.01'));
      expect(result.msgValueWei(parseEther('0.0005'))).toBe(
        parseEther('0.0105'),
      );
    }
  });

  it('resolveDevBuyIntent maps USDG buy to fee-only msg.value', () => {
    const state = createInitialLaunchState({
      quoteAsset: USDG,
      quoteSymbol: 'USDG',
      quoteDecimals: 6,
      devBuyAmount: '10',
    });
    const result = resolveDevBuyIntent(state, USDG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.functionName).toBe('launchAndBuy');
      expect(result.quoteAmountIn).toBe(parseUnits('10', 6));
      expect(result.msgValueWei(parseEther('0.0005'))).toBe(parseEther('0.0005'));
    }
  });

  it('resolveDevBuyIntent maps stock buy without symbol-specific branches', () => {
    const state = createInitialLaunchState({
      quoteAsset: AAPL,
      quoteSymbol: 'AAPL',
      quoteDecimals: 18,
      devBuyAmount: '2',
    });
    const result = resolveDevBuyIntent(state, AAPL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.functionName).toBe('launchAndBuy');
      expect(result.quoteAmountIn).toBe(parseUnits('2', 18));
      expect(result.msgValueWei(parseEther('0.0005'))).toBe(parseEther('0.0005'));
    }
  });

  it('computeLaunchAndBuyMsgValue is native vs ERC-20 aware', () => {
    const fee = parseEther('0.0005');
    const buy = parseEther('0.01');
    expect(
      computeLaunchAndBuyMsgValue({
        quoteAsset: zeroAddress,
        launchFeeWei: fee,
        quoteAmountIn: buy,
      }),
    ).toBe(fee + buy);
    expect(
      computeLaunchAndBuyMsgValue({
        quoteAsset: USDG,
        launchFeeWei: fee,
        quoteAmountIn: parseUnits('10', 6),
      }),
    ).toBe(fee);
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

  it('format helpers preserve display totals', () => {
    expect(formatEthWei(parseEther('0.0105'))).toBe('0.0105');
    expect(formatQuoteRaw(parseUnits('10.5', 6), 6)).toBe('10.5');
  });
});
