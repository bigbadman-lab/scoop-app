/**
 * Pump SDK accessor (server/test only).
 *
 * The package is webpack-bundled into the Next server build (not externalized)
 * so Vercel does not need a runtime Node resolve of `@pump-fun/pump-sdk`.
 * Earlier createRequire / free-require paths became `(void 0)(...)` or
 * MODULE_NOT_FOUND stubs in the serverless bundle.
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
    // Bundled by Next server webpack — do not use createRequire / free require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@pump-fun/pump-sdk');
    cached = assertPumpSdkModule(mod);
    return cached;
  } catch (err) {
    if (err instanceof Error && err.message === PUMP_SDK_EXPORT_MISSING) {
      throw err;
    }
    const detail =
      err instanceof Error
        ? err.message.replace(/(?:\/[\w.@+-]+)+/g, '[path]').slice(0, 120)
        : 'unknown';
    throw new Error(`${PUMP_SDK_UNAVAILABLE}:${detail}`);
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
