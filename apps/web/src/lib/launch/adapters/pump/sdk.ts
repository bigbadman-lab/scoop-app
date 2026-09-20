/**
 * Lazy CJS load of official Pump SDK (server/test only).
 * Top-level createRequire + immediate require breaks Next page-data collection
 * when webpack stubs createRequire. Load only when building an instruction.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

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

export function loadPumpSdk(): PumpSdkModule {
  if (cached) return cached;
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  cached = require('@pump-fun/pump-sdk') as PumpSdkModule;
  return cached;
}

export function getPumpSdkApi() {
  return loadPumpSdk().PUMP_SDK;
}

export function getPumpProgramId() {
  return loadPumpSdk().PUMP_PROGRAM_ID;
}
