/**
 * Lazy CJS load of official Pump SDK (server/test only).
 *
 * IMPORTANT: use a string-literal `require('@pump-fun/pump-sdk')` so Next's
 * webpack externals (`serverExternalPackages` + commonjs external) keep a real
 * Node require in the serverless bundle.
 *
 * `createRequire(path.join(process.cwd(), 'package.json'))` is rewritten to
 * `(void 0)("@pump-fun/pump-sdk")` in `.next/server`, which throws
 * `(void 0) is not a function` on the first funded prepare (after getBalance).
 */
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

export const PUMP_SDK_UNAVAILABLE = 'pump_sdk_unavailable';
export const PUMP_SDK_EXPORT_MISSING = 'pump_sdk_export_missing';

type PumpSdkModule = {
  PUMP_SDK: {
    createV2Instruction: (args: {
      mint: PublicKey;
      name: string;
      symbol: string;
      uri: string;
      creator: PublicKey;
      user: PublicKey;
      mayhemMode: boolean;
      cashback?: boolean;
      holderReward?: boolean;
    }) => Promise<TransactionInstruction>;
  };
  PUMP_PROGRAM_ID: PublicKey;
};

let cached: PumpSdkModule | null = null;

function assertPumpSdkModule(mod: unknown): PumpSdkModule {
  const candidate = mod as Partial<PumpSdkModule> | null | undefined;
  if (
    !candidate?.PUMP_SDK ||
    typeof candidate.PUMP_SDK.createV2Instruction !== 'function' ||
    !candidate.PUMP_PROGRAM_ID
  ) {
    throw new Error(PUMP_SDK_EXPORT_MISSING);
  }
  return candidate as PumpSdkModule;
}

export function loadPumpSdk(): PumpSdkModule {
  if (cached) return cached;
  try {
    // String literal — do not wrap with createRequire/dynamic path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@pump-fun/pump-sdk');
    cached = assertPumpSdkModule(mod);
    return cached;
  } catch (err) {
    if (err instanceof Error && err.message === PUMP_SDK_EXPORT_MISSING) {
      throw err;
    }
    throw new Error(PUMP_SDK_UNAVAILABLE);
  }
}

/** Test helper — clears the module cache between cases. */
export function resetPumpSdkCacheForTests(): void {
  cached = null;
}

export function getPumpSdkApi() {
  return loadPumpSdk().PUMP_SDK;
}

export function getPumpProgramId() {
  return loadPumpSdk().PUMP_PROGRAM_ID;
}
