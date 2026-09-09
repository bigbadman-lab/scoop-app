import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256, toBytes } from 'viem';
import { buildUniversalRouterV4SwapCall, encodeV4ExactInSingleInput } from '@/lib/trade/encode-v4-swap';
import {
  poolKeyFromIndexed,
  settleTakeCurrencies,
  zeroForOneForTrade,
} from '@/lib/trade/pool-key';
import { parseAmountReceivedFromRevert } from '@/lib/trade/quote';
import { assertSlippageBps, minimumAmountOut } from '@/lib/trade/slippage';
import { UR_CMD_V4_SWAP } from '@/lib/trade/constants';

const HELLO_KEY = {
  currency0: '0x0000000000000000000000000000000000000000' as const,
  currency1: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373' as const,
  fee: 10000,
  tickSpacing: 10,
  hooks: '0x0000000000000000000000000000000000000000' as const,
};

describe('trade pool key', () => {
  it('requires full indexed key and sets BUY/SELL zeroForOne', () => {
    expect(
      poolKeyFromIndexed({
        currency0: HELLO_KEY.currency0,
        currency1: HELLO_KEY.currency1,
        fee: 10000,
        tickSpacing: 10,
        hooks: HELLO_KEY.hooks,
      }),
    ).toEqual(HELLO_KEY);
    expect(
      poolKeyFromIndexed({
        currency0: HELLO_KEY.currency0,
        currency1: HELLO_KEY.currency1,
        fee: 10000,
        tickSpacing: null,
        hooks: HELLO_KEY.hooks,
      }),
    ).toBeNull();

    expect(
      zeroForOneForTrade({
        mode: 'buy',
        poolKey: HELLO_KEY,
        quoteAsset: HELLO_KEY.currency0,
        tokenAddress: HELLO_KEY.currency1,
      }),
    ).toBe(true);
    expect(
      zeroForOneForTrade({
        mode: 'sell',
        poolKey: HELLO_KEY,
        quoteAsset: HELLO_KEY.currency0,
        tokenAddress: HELLO_KEY.currency1,
      }),
    ).toBe(false);
  });
});

describe('slippage', () => {
  it('computes minimum out with bigint math and rejects invalid bps', () => {
    expect(minimumAmountOut(BigInt(1_000_000), 100)).toBe(BigInt(990_000));
    expect(minimumAmountOut(BigInt(100), 100)).toBe(BigInt(99));
    expect(() => assertSlippageBps(0)).toThrow(/Slippage/);
    expect(() => assertSlippageBps(6000)).toThrow(/Slippage/);
  });
});

describe('v4 swap encoding', () => {
  it('builds BUY ETH path with msg.value and V4_SWAP command', () => {
    const amountIn = BigInt('10000000000000000'); // 0.01 ETH
    const call = buildUniversalRouterV4SwapCall({
      poolKey: HELLO_KEY,
      zeroForOne: true,
      amountIn,
      amountOutMinimum: BigInt(1),
      deadline: BigInt(1_700_000_000),
    });
    expect(call.commands.toLowerCase()).toBe(`0x${UR_CMD_V4_SWAP.toString(16).padStart(2, '0')}`);
    expect(call.value).toBe(amountIn);
    expect(call.settleCurrency).toBe(HELLO_KEY.currency0);
    expect(call.takeCurrency).toBe(HELLO_KEY.currency1);
    expect(call.inputs).toHaveLength(1);
    expect(call.inputs[0]!.startsWith('0x')).toBe(true);
  });

  it('builds SELL token path with zero value', () => {
    const amountIn = BigInt('1000000000000000000');
    const call = buildUniversalRouterV4SwapCall({
      poolKey: HELLO_KEY,
      zeroForOne: false,
      amountIn,
      amountOutMinimum: BigInt(1),
      deadline: BigInt(1_700_000_000),
    });
    expect(call.value).toBe(BigInt(0));
    const { settle, take } = settleTakeCurrencies({
      poolKey: HELLO_KEY,
      zeroForOne: false,
    });
    expect(call.settleCurrency).toBe(settle);
    expect(call.takeCurrency).toBe(take);
    const again = encodeV4ExactInSingleInput({
      poolKey: HELLO_KEY,
      zeroForOne: false,
      amountIn,
      amountOutMinimum: BigInt(1),
    });
    expect(again).toBe(call.inputs[0]);
  });
});

describe('quote revert parsing', () => {
  it('decodes V4TooLittleReceived amountReceived', () => {
    const amountReceived = BigInt(123456789);
    const data = encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint256' }],
      [BigInt(1), amountReceived],
    );
    const selector = keccak256(toBytes('V4TooLittleReceived(uint256,uint256)')).slice(0, 10);
    const error = Object.assign(new Error('execution reverted'), {
      data: `${selector}${data.slice(2)}`,
    });
    expect(parseAmountReceivedFromRevert(error)).toBe(amountReceived);
  });
});
