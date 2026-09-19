import type { PublicClient, TransactionReceipt } from 'viem';
import { runPonsPreflight } from './preflight';
import { buildPonsTokenParams, buildPonsLaunchAndBuyArgs } from './build-params';
import { simulatePonsLaunchAndBuy } from './simulate';
import { decodePonsLaunchAndBuyReceipt } from './decode-receipt';
import { resolvePonsSalt } from './salt';
import type {
  PonsDecodeResult,
  PonsLaunchAdapterInput,
  PonsPreflightResult,
  PonsSimulationResult,
  PonsTokenParams,
} from './types';

/**
 * Minimal protocol adapter boundary so Scoop and Pons can coexist.
 * Gate 3: Pons path is simulation-only; public /launch still uses Scoop.
 */
export type LaunchProtocolAdapter = {
  preflight: (args: {
    publicClient: PublicClient;
    chainId: number;
    input: PonsLaunchAdapterInput;
  }) => Promise<PonsPreflightResult>;
  prepare: (args: {
    input: PonsLaunchAdapterInput;
    preflight: PonsPreflightResult;
  }) => PonsTokenParams;
  simulate: (args: {
    publicClient: PublicClient;
    input: PonsLaunchAdapterInput;
    preflight: PonsPreflightResult;
  }) => Promise<PonsSimulationResult>;
  decodeReceipt: (args: {
    receipt: TransactionReceipt;
    expectedCreator: `0x${string}`;
  }) => PonsDecodeResult;
};

export const ponsLaunchAdapter: LaunchProtocolAdapter = {
  async preflight({ publicClient, chainId, input }) {
    // Ensure salt is resolved once for the draft before downstream prepare/simulate.
    if (!input.salt) {
      input = { ...input, salt: resolvePonsSalt() };
    }
    return runPonsPreflight({ publicClient, chainId, input });
  },

  prepare({ input, preflight }) {
    return buildPonsTokenParams({ input, preflight, salt: input.salt });
  },

  simulate({ publicClient, input, preflight }) {
    return simulatePonsLaunchAndBuy({ publicClient, input, preflight });
  },

  decodeReceipt({ receipt, expectedCreator }) {
    return decodePonsLaunchAndBuyReceipt({ receipt, expectedCreator });
  },
};

/** Re-export builder for tests that need minTokensOut explicitly. */
export { buildPonsLaunchAndBuyArgs };
