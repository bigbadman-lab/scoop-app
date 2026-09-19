import { describe, expect, it } from 'vitest';
import { decodePonsLaunchAndBuyReceipt } from './decode-receipt';
import { PonsAdapterError } from './errors';
import { PONS_V2_LAUNCH_AND_BUY } from './constants';
import {
  FIXTURE_CREATOR,
  FIXTURE_CURVE,
  FIXTURE_QUOTE_IN,
  FIXTURE_TOKEN,
  FIXTURE_TOKENS_OUT,
  makeCurveBuyLog,
  makeCurveBuyRefundedLog,
  makeReceipt,
  makeTokenLaunchedLog,
  normalLaunchAndBuyReceipt,
} from './__fixtures__/receipts';

describe('pons receipt decode', () => {
  it('decodes normal LaunchAndBuy with exact tokensOut', () => {
    const decoded = decodePonsLaunchAndBuyReceipt({
      receipt: normalLaunchAndBuyReceipt(),
      expectedCreator: FIXTURE_CREATOR,
    });
    expect(decoded.tokenAddress.toLowerCase()).toBe(FIXTURE_TOKEN.toLowerCase());
    expect(decoded.curveAddress.toLowerCase()).toBe(FIXTURE_CURVE.toLowerCase());
    expect(decoded.deployer.toLowerCase()).toBe(FIXTURE_CREATOR.toLowerCase());
    expect(decoded.actualTokensOut).toBe(FIXTURE_TOKENS_OUT);
    expect(decoded.actualQuoteIn).toBe(FIXTURE_QUOTE_IN);
    expect(decoded.refundWei).toBe(BigInt(0));
    expect(decoded.creatorRecipient.toLowerCase()).toBe(FIXTURE_CREATOR.toLowerCase());
    expect(decoded.curveBuyBuyer.toLowerCase()).toBe(PONS_V2_LAUNCH_AND_BUY);
    expect(decoded.launchConfigId).toBe(BigInt(0));
  });

  it('captures CurveBuyRefunded', () => {
    const receipt = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: FIXTURE_CREATOR,
      }),
      makeCurveBuyLog({
        curve: FIXTURE_CURVE,
        buyer: PONS_V2_LAUNCH_AND_BUY,
        recipient: FIXTURE_CREATOR,
        quoteIn: FIXTURE_QUOTE_IN,
        tokensOut: FIXTURE_TOKENS_OUT,
      }),
      makeCurveBuyRefundedLog({
        curve: FIXTURE_CURVE,
        buyer: PONS_V2_LAUNCH_AND_BUY,
        recipient: FIXTURE_CREATOR,
        quoteRefunded: BigInt(123),
      }),
    ]);
    const decoded = decodePonsLaunchAndBuyReceipt({
      receipt,
      expectedCreator: FIXTURE_CREATOR,
    });
    expect(decoded.refundWei).toBe(BigInt(123));
    expect(decoded.actualTokensOut).toBe(FIXTURE_TOKENS_OUT);
  });

  it('rejects wrong deployer', () => {
    const receipt = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: '0x1111111111111111111111111111111111111111',
      }),
      makeCurveBuyLog({
        curve: FIXTURE_CURVE,
        buyer: PONS_V2_LAUNCH_AND_BUY,
        recipient: FIXTURE_CREATOR,
        quoteIn: BigInt(1),
        tokensOut: BigInt(1),
      }),
    ]);
    expect(() =>
      decodePonsLaunchAndBuyReceipt({
        receipt,
        expectedCreator: FIXTURE_CREATOR,
      }),
    ).toThrow(PonsAdapterError);
    try {
      decodePonsLaunchAndBuyReceipt({ receipt, expectedCreator: FIXTURE_CREATOR });
    } catch (e) {
      expect((e as PonsAdapterError).code).toBe('CREATOR_MISMATCH');
    }
  });

  it('rejects wrong recipient', () => {
    const receipt = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: FIXTURE_CREATOR,
      }),
      makeCurveBuyLog({
        curve: FIXTURE_CURVE,
        buyer: PONS_V2_LAUNCH_AND_BUY,
        recipient: '0x1111111111111111111111111111111111111111',
        quoteIn: BigInt(1),
        tokensOut: BigInt(1),
      }),
    ]);
    try {
      decodePonsLaunchAndBuyReceipt({ receipt, expectedCreator: FIXTURE_CREATOR });
      expect.unreachable();
    } catch (e) {
      expect((e as PonsAdapterError).code).toBe('RECEIPT_DECODE_FAILED');
    }
  });

  it('rejects missing TokenLaunched', () => {
    const receipt = makeReceipt([
      makeCurveBuyLog({
        curve: FIXTURE_CURVE,
        buyer: PONS_V2_LAUNCH_AND_BUY,
        recipient: FIXTURE_CREATOR,
        quoteIn: BigInt(1),
        tokensOut: BigInt(1),
      }),
    ]);
    try {
      decodePonsLaunchAndBuyReceipt({ receipt, expectedCreator: FIXTURE_CREATOR });
      expect.unreachable();
    } catch (e) {
      expect((e as PonsAdapterError).code).toBe('RECEIPT_DECODE_FAILED');
      expect((e as Error).message).toMatch(/TokenLaunched/i);
    }
  });

  it('rejects missing CurveBuy', () => {
    const receipt = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: FIXTURE_CREATOR,
      }),
    ]);
    try {
      decodePonsLaunchAndBuyReceipt({ receipt, expectedCreator: FIXTURE_CREATOR });
      expect.unreachable();
    } catch (e) {
      expect((e as PonsAdapterError).code).toBe('RECEIPT_DECODE_FAILED');
      expect((e as Error).message).toMatch(/CurveBuy/i);
    }
  });

  it('rejects ambiguous multiple TokenLaunched', () => {
    const receipt = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: FIXTURE_CREATOR,
      }),
      makeTokenLaunchedLog({
        token: '0x1111111111111111111111111111111111111111',
        curve: '0x2222222222222222222222222222222222222222',
        deployer: FIXTURE_CREATOR,
      }),
    ]);
    try {
      decodePonsLaunchAndBuyReceipt({ receipt, expectedCreator: FIXTURE_CREATOR });
      expect.unreachable();
    } catch (e) {
      expect((e as PonsAdapterError).code).toBe('RECEIPT_DECODE_FAILED');
      expect((e as Error).message).toMatch(/Ambiguous/i);
    }
  });

  it('handles tiny initial buy tokensOut', () => {
    const receipt = makeReceipt([
      makeTokenLaunchedLog({
        token: FIXTURE_TOKEN,
        curve: FIXTURE_CURVE,
        deployer: FIXTURE_CREATOR,
      }),
      makeCurveBuyLog({
        curve: FIXTURE_CURVE,
        buyer: PONS_V2_LAUNCH_AND_BUY,
        recipient: FIXTURE_CREATOR,
        quoteIn: BigInt(300960000000000),
        tokensOut: BigInt('173738381158275242451512'),
      }),
    ]);
    const decoded = decodePonsLaunchAndBuyReceipt({
      receipt,
      expectedCreator: FIXTURE_CREATOR,
    });
    expect(decoded.actualTokensOut).toBe(BigInt('173738381158275242451512'));
    expect(decoded.actualQuoteIn).toBe(BigInt(300960000000000));
  });
});
