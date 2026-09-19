import { describe, expect, it, vi } from 'vitest';
import { computePonsMinTokensOut, simulatePonsLaunchAndBuy } from './simulate';
import { PONS_DEV_BUY_SLIPPAGE_BPS, PONS_NATIVE_PAIR_TOKEN } from './constants';
import { mapPonsRevertToAdapterError } from './errors';
import type { PonsLaunchAdapterInput, PonsPreflightResult } from './types';

const creator = '0x5Fd466ba9576527974FEC62cF96D058FC667F70f' as const;
const salt =
  '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789' as const;
const economics =
  '0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7' as const;
const token = '0x5806a32Ad9B52b39d1836d18a6C16328105ABDa2' as const;
const curve = '0xdE0E7e06E54003D112EeC210E5dDF727317cb6b0' as const;

const input: PonsLaunchAdapterInput = {
  creator,
  name: 'Example',
  symbol: 'EXMPL',
  logo: 'ipfs://bafy',
  description: 'An example',
  creatorTaxBps: 0,
  buybackEnabled: true,
  quoteInWei: BigInt('45000000000000000'),
  slippageBps: PONS_DEV_BUY_SLIPPAGE_BPS,
  salt,
};

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
  quoteInWei: input.quoteInWei,
  requiredMsgValueWei: BigInt(500000000000000) + input.quoteInWei,
};

describe('pons simulation helpers', () => {
  it('applies named 1% default to probe tokensOut', () => {
    const simulated = BigInt(10000);
    expect(computePonsMinTokensOut(simulated, PONS_DEV_BUY_SLIPPAGE_BPS)).toBe(BigInt(9900));
  });

  it('rejects zero min after extreme slippage', () => {
    expect(() => computePonsMinTokensOut(BigInt(1), 10_000)).toThrow(/zero/i);
  });

  it('maps SlippageExceeded custom error', () => {
    const err = mapPonsRevertToAdapterError(new Error('execution reverted: SlippageExceeded()'));
    expect(err.code).toBe('SLIPPAGE_EXCEEDED');
    expect(err.ponsError).toBe('SlippageExceeded');
  });

  it('maps LaunchEconomicsMismatch', () => {
    const err = mapPonsRevertToAdapterError(
      new Error('LaunchEconomicsMismatch'),
    );
    expect(err.code).toBe('ECONOMICS_CHANGED');
  });

  it('two-stage simulation returns final request with minTokensOut', async () => {
    const probeOut = BigInt('25324166739187189974762857');
    let calls = 0;
    const publicClient = {
      simulateContract: vi.fn(async ({ args }: { args: readonly unknown[] }) => {
        calls += 1;
        const minOut = args[4] as bigint;
        if (calls === 1) {
          expect(minOut).toBe(BigInt(1));
        } else {
          expect(minOut).toBe(computePonsMinTokensOut(probeOut, 100));
        }
        return {
          result: [token, curve, probeOut] as const,
          request: {},
        };
      }),
    };

    const result = await simulatePonsLaunchAndBuy({
      publicClient: publicClient as never,
      input,
      preflight,
    });

    expect(publicClient.simulateContract).toHaveBeenCalledTimes(2);
    expect(result.probeTokensOut).toBe(probeOut);
    expect(result.simulatedTokensOut).toBe(probeOut);
    expect(result.minTokensOut).toBe(computePonsMinTokensOut(probeOut, 100));
    expect(result.request.args[4]).toBe(result.minTokensOut);
    expect(result.request.value).toBe(preflight.requiredMsgValueWei);
    expect(result.simulatedTokenAddress?.toLowerCase()).toBe(token.toLowerCase());
    expect(result.simulatedCurveAddress?.toLowerCase()).toBe(curve.toLowerCase());
    expect(result.salt).toBe(salt);
    expect(result.expectedEconomics).toBe(economics);
  });

  it('probe and final simulation both use the selected creator fee, not 0', async () => {
    const probeOut = BigInt('1000');
    const publicClient = {
      simulateContract: vi.fn(async ({ args }: { args: readonly unknown[] }) => {
        const params = args[0] as { creatorTaxBps: number; creatorFeeRecipient: string; buybackEnabled: boolean };
        expect(params.creatorTaxBps).toBe(200);
        expect(params.creatorTaxBps).not.toBe(0);
        expect(params.creatorFeeRecipient.toLowerCase()).toBe(creator.toLowerCase());
        expect(params.buybackEnabled).toBe(true);
        return { result: [token, curve, probeOut] as const, request: {} };
      }),
    };
    const result = await simulatePonsLaunchAndBuy({
      publicClient: publicClient as never,
      input: { ...input, creatorTaxBps: 200 },
      preflight,
    });
    expect(publicClient.simulateContract).toHaveBeenCalledTimes(2);
    expect(result.request.args[0].creatorTaxBps).toBe(200);
    expect(result.request.args[0].buybackEnabled).toBe(true);
  });
});
