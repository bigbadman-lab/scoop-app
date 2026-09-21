/**
 * Pump SDK accessor (server/test only).
 *
 * The package is webpack-bundled into the Next server build (not externalized)
 * so Vercel does not need a runtime Node resolve of `@pump-fun/pump-sdk`.
 */
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

export const PUMP_SDK_UNAVAILABLE = 'pump_sdk_unavailable';
export const PUMP_SDK_EXPORT_MISSING = 'pump_sdk_export_missing';

/** Minimal BN surface used by create+buy sizing. */
export type PumpBn = {
  toString: (base?: number) => string;
};

type PumpSdkApi = {
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
  createV2AndBuyInstructions: (args: {
    global: unknown;
    mint: PublicKey;
    name: string;
    symbol: string;
    uri: string;
    creator: PublicKey;
    user: PublicKey;
    amount: PumpBn;
    solAmount: PumpBn;
    mayhemMode: boolean;
    cashback?: boolean;
    holderReward?: boolean;
  }) => Promise<TransactionInstruction[]>;
};

type OnlinePumpSdkCtor = new (connection: Connection) => {
  fetchGlobal: () => Promise<unknown>;
  fetchFeeConfig: () => Promise<unknown>;
  getCreatorVaultBalanceBothPrograms?: (
    creator: PublicKey,
  ) => Promise<PumpBn>;
  collectCoinCreatorFeeInstructions?: (
    coinCreator: PublicKey,
    feePayer?: PublicKey,
  ) => Promise<TransactionInstruction[]>;
  fetchBondingCurve?: (mint: PublicKey) => Promise<{ creator: PublicKey }>;
};

type PumpSdkModule = {
  PUMP_SDK: PumpSdkApi;
  PUMP_PROGRAM_ID: PublicKey;
  OnlinePumpSdk: OnlinePumpSdkCtor;
  getBuyTokenAmountFromSolAmount: (args: {
    global: unknown;
    feeConfig: unknown;
    mintSupply: null;
    bondingCurve: null;
    amount: PumpBn;
    quoteMint: PublicKey;
  }) => PumpBn;
  hasCoinCreatorMigratedToSharingConfig?: (args: {
    mint: PublicKey;
    creator: PublicKey;
  }) => boolean;
};

type BnCtor = new (n: string | number | bigint, base?: number) => PumpBn;

let cached: PumpSdkModule | null = null;
let cachedBn: BnCtor | null = null;

function assertPumpSdkModule(mod: unknown): PumpSdkModule {
  const candidate = mod as Partial<PumpSdkModule> | null | undefined;
  if (
    !candidate?.PUMP_SDK ||
    typeof candidate.PUMP_SDK.createV2Instruction !== 'function' ||
    typeof candidate.PUMP_SDK.createV2AndBuyInstructions !== 'function' ||
    typeof candidate.OnlinePumpSdk !== 'function' ||
    typeof candidate.getBuyTokenAmountFromSolAmount !== 'function' ||
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
        ? err.message
            // Preserve package names like @pump-fun/pump-sdk; strip only absolute paths.
            .replace(/\/(?:Users|home|var|tmp)\/[^\s:]+/g, '[path]')
            .slice(0, 180)
        : 'unknown';
    throw new Error(`${PUMP_SDK_UNAVAILABLE}:${detail}`);
  }
}

/** bn.js via pump-sdk dependency tree (server-only). */
export function loadPumpBn(): BnCtor {
  if (cachedBn) return cachedBn;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BN = require('bn.js');
    if (typeof BN !== 'function') throw new Error(PUMP_SDK_EXPORT_MISSING);
    cachedBn = BN as BnCtor;
    return cachedBn;
  } catch (err) {
    if (err instanceof Error && err.message === PUMP_SDK_EXPORT_MISSING) throw err;
    throw new Error(PUMP_SDK_UNAVAILABLE);
  }
}

/** Test helper — clears the module cache between cases. */
export function resetPumpSdkCacheForTests(): void {
  cached = null;
  cachedBn = null;
}

export function getPumpSdkApi() {
  return loadPumpSdk().PUMP_SDK;
}

export function getPumpProgramId() {
  return loadPumpSdk().PUMP_PROGRAM_ID;
}

export function getOnlinePumpSdk(connection: Connection) {
  const { OnlinePumpSdk } = loadPumpSdk();
  return new OnlinePumpSdk(connection);
}

export function getBuyTokenAmountFromSolAmount(
  args: Parameters<PumpSdkModule['getBuyTokenAmountFromSolAmount']>[0],
) {
  return loadPumpSdk().getBuyTokenAmountFromSolAmount(args);
}

/** WSOL mint — SOL-paired Pump create+buy. */
export const PUMP_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
