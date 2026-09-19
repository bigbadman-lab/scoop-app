import { describe, expect, it } from 'vitest';
import {
  buildPonsLaunchAndBuyArgs,
  buildPonsTokenParams,
} from './build-params';
import {
  PONS_LAUNCH_CONFIG_ID,
  PONS_NATIVE_PAIR_TOKEN,
  PONS_V2_LAUNCH_AND_BUY,
} from './constants';
import type { PonsLaunchAdapterInput, PonsPreflightResult } from './types';

const creator = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;
const salt =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
const economics =
  '0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7' as const;

function input(over?: Partial<PonsLaunchAdapterInput>): PonsLaunchAdapterInput {
  return {
    creator,
    name: 'Example',
    symbol: 'EXMPL',
    logo: 'ipfs://bafy',
    description: 'An example',
    twitter: '@x',
    telegram: 'tg',
    website: 'https://example.com',
    discord: '',
    farcaster: '',
    creatorTaxBps: 0,
    buybackEnabled: true,
    quoteInWei: BigInt('45000000000000000'),
    slippageBps: 100,
    salt,
    ...over,
  };
}

const preflight: PonsPreflightResult = {
  chainId: 4663,
  canLaunch: true,
  launchEnabled: true,
  launchFeeWei: BigInt(500000000000000),
  launchConfigId: BigInt(0),
  pairToken: PONS_NATIVE_PAIR_TOKEN,
  configEnabled: true,
  configSupply: BigInt(10) ** BigInt(27),
  configCurveFeeBps: BigInt(100),
  configPhantomQuote: BigInt('1680000000000000000'),
  configGraduationThreshold: BigInt('4200000000000000000'),
  expectedEconomics: economics,
  maxCreatorTaxBps: 1000,
  creatorEthBalance: BigInt(10) ** BigInt(18),
  quoteInWei: BigInt('45000000000000000'),
  requiredMsgValueWei: BigInt(500000000000000) + BigInt('45000000000000000'),
};

describe('pons build-params', () => {
  it('maps TokenParams with creator as fee recipient', () => {
    const params = buildPonsTokenParams({ input: input(), preflight });
    expect(params.name).toBe('Example');
    expect(params.symbol).toBe('EXMPL');
    expect(params.logo).toBe('ipfs://bafy');
    expect(params.creatorFeeRecipient.toLowerCase()).toBe(creator.toLowerCase());
    expect(params.expectedEconomics).toBe(economics);
    expect(params.salt).toBe(salt);
    expect(params.creatorTaxBps).toBe(0);
    expect(params.buybackEnabled).toBe(true);
    expect(params.socials.twitter).toBe('@x');
    expect(params.socials.website).toBe('https://example.com');
  });

  it('builds native LaunchAndBuy with locked values', () => {
    const params = buildPonsTokenParams({ input: input(), preflight });
    const req = buildPonsLaunchAndBuyArgs({
      input: input(),
      preflight,
      params,
      minTokensOut: BigInt(1),
    });
    expect(req.address).toBe(PONS_V2_LAUNCH_AND_BUY);
    expect(req.functionName).toBe('launchAndBuy');
    expect(req.args[1]).toBe(PONS_LAUNCH_CONFIG_ID);
    expect(req.args[2]).toBe(PONS_NATIVE_PAIR_TOKEN);
    expect(req.args[3]).toBe(BigInt('45000000000000000'));
    expect(req.args[4]).toBe(BigInt(1));
    expect(req.args[5].toLowerCase()).toBe(creator.toLowerCase());
    expect(req.args[6]).toEqual([]);
    expect(req.value).toBe(preflight.requiredMsgValueWei);
    expect(req.value).toBe(preflight.launchFeeWei + input().quoteInWei);
  });

  it('keeps the creator wallet as fee recipient for a 2% selection', () => {
    const params = buildPonsTokenParams({
      input: input({ creatorTaxBps: 200 }),
      preflight,
    });
    expect(params.creatorTaxBps).toBe(200);
    expect(params.creatorFeeRecipient.toLowerCase()).toBe(creator.toLowerCase());
    expect(params.buybackEnabled).toBe(true);
  });

  it('rejects zero quote', () => {
    const params = buildPonsTokenParams({ input: input(), preflight });
    expect(() =>
      buildPonsLaunchAndBuyArgs({
        input: input({ quoteInWei: BigInt(0) }),
        preflight: { ...preflight, quoteInWei: BigInt(0), requiredMsgValueWei: preflight.launchFeeWei },
        params,
        minTokensOut: BigInt(1),
      }),
    ).toThrow(/dev buy/i);
  });
});
