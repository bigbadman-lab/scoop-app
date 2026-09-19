import type { PublicClient } from 'viem';
import { getAddress } from 'viem';
import { PONS_DEV_BUY_SLIPPAGE_BPS, PONS_PROBE_MIN_TOKENS_OUT } from './constants';
import { buildPonsLaunchAndBuyArgs, buildPonsTokenParams } from './build-params';
import { mapPonsRevertToAdapterError, PonsAdapterError } from './errors';
import type {
  PonsLaunchAdapterInput,
  PonsPreflightResult,
  PonsSimulationResult,
} from './types';

/**
 * minTokensOut = simulatedTokensOut * (10_000 - slippageBps) / 10_000
 * Must remain > 0.
 */
export function computePonsMinTokensOut(
  simulatedTokensOut: bigint,
  slippageBps: number = PONS_DEV_BUY_SLIPPAGE_BPS,
): bigint {
  if (simulatedTokensOut <= BigInt(0)) {
    throw new PonsAdapterError(
      'SIMULATION_FAILED',
      'Probe simulation returned zero tokensOut.',
    );
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new PonsAdapterError('INVALID_INPUT', 'slippageBps must be an integer 0–10000.');
  }
  const min =
    (simulatedTokensOut * BigInt(10_000 - slippageBps)) / BigInt(10000);
  if (min <= BigInt(0)) {
    throw new PonsAdapterError(
      'SLIPPAGE_EXCEEDED',
      'minTokensOut rounded to zero — reduce slippage or increase buy.',
    );
  }
  return min;
}

function extractSimResult(result: unknown): {
  token: `0x${string}` | null;
  curve: `0x${string}` | null;
  tokensOut: bigint;
} {
  if (Array.isArray(result) && result.length >= 3) {
    return {
      token: result[0] as `0x${string}`,
      curve: result[1] as `0x${string}`,
      tokensOut: result[2] as bigint,
    };
  }
  if (result && typeof result === 'object') {
    const r = result as {
      token?: `0x${string}`;
      curve?: `0x${string}`;
      tokensOut?: bigint;
    };
    if (r.tokensOut != null) {
      return {
        token: r.token ?? null,
        curve: r.curve ?? null,
        tokensOut: r.tokensOut,
      };
    }
  }
  throw new PonsAdapterError(
    'SIMULATION_FAILED',
    'Unexpected LaunchAndBuy simulation return shape.',
  );
}

/**
 * Two-stage simulateContract for native ETH LaunchAndBuy.
 * Returns a final write-ready request — does not broadcast.
 */
export async function simulatePonsLaunchAndBuy(args: {
  publicClient: PublicClient;
  input: PonsLaunchAdapterInput;
  preflight: PonsPreflightResult;
}): Promise<PonsSimulationResult> {
  const { publicClient, input, preflight } = args;
  const creator = getAddress(input.creator) as `0x${string}`;
  const slippageBps = input.slippageBps;

  const params = buildPonsTokenParams({
    input,
    preflight,
    salt: input.salt,
  });

  const probeRequest = buildPonsLaunchAndBuyArgs({
    input,
    preflight,
    params,
    minTokensOut: PONS_PROBE_MIN_TOKENS_OUT,
  });

  let probeTokensOut: bigint;
  let probeToken: `0x${string}` | null = null;
  let probeCurve: `0x${string}` | null = null;

  try {
    const probe = await publicClient.simulateContract({
      address: probeRequest.address,
      abi: probeRequest.abi,
      functionName: 'launchAndBuy',
      args: [...probeRequest.args],
      value: probeRequest.value,
      account: creator,
    });
    const extracted = extractSimResult(probe.result);
    probeTokensOut = extracted.tokensOut;
    probeToken = extracted.token;
    probeCurve = extracted.curve;
  } catch (e) {
    throw mapPonsRevertToAdapterError(e);
  }

  const minTokensOut = computePonsMinTokensOut(probeTokensOut, slippageBps);
  const finalRequest = buildPonsLaunchAndBuyArgs({
    input,
    preflight,
    params,
    minTokensOut,
  });

  let finalTokensOut = probeTokensOut;
  let finalToken = probeToken;
  let finalCurve = probeCurve;

  try {
    const finalSim = await publicClient.simulateContract({
      address: finalRequest.address,
      abi: finalRequest.abi,
      functionName: 'launchAndBuy',
      args: [...finalRequest.args],
      value: finalRequest.value,
      account: creator,
    });
    const extracted = extractSimResult(finalSim.result);
    finalTokensOut = extracted.tokensOut;
    finalToken = extracted.token;
    finalCurve = extracted.curve;
  } catch (e) {
    throw mapPonsRevertToAdapterError(e);
  }

  return {
    request: finalRequest,
    simulatedTokenAddress: finalToken,
    simulatedCurveAddress: finalCurve,
    simulatedTokensOut: finalTokensOut,
    minTokensOut,
    launchFeeWei: preflight.launchFeeWei,
    quoteInWei: input.quoteInWei,
    msgValueWei: finalRequest.value,
    expectedEconomics: params.expectedEconomics,
    salt: params.salt,
    probeTokensOut,
    slippageBps,
  };
}
