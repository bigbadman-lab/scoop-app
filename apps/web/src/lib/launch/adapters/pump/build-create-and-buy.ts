import {
  PublicKey,
  type Connection,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  getBuyTokenAmountFromSolAmount,
  getOnlinePumpSdk,
  getPumpProgramId,
  getPumpSdkApi,
  loadPumpBn,
  PUMP_NATIVE_MINT,
} from '@/lib/launch/adapters/pump/sdk';
import { assertPumpCreateInput } from '@/lib/launch/adapters/pump/validation';
import {
  PUMP_CREATE_DEFAULTS,
  PUMP_PROGRAM_ID_MAINNET,
  type PumpCreateInput,
  type PumpPreparedCreate,
} from '@/lib/launch/adapters/pump/types';

export type PumpPreparedCreateAndBuy = Omit<PumpPreparedCreate, 'instruction'> & {
  instructions: TransactionInstruction[];
  solAmountLamports: string;
  tokenAmountRaw: string;
};

/**
 * Official SOL-paired create_v2 + buy in one instruction set.
 * Uses SDK createV2AndBuyInstructions (hardcoded 1% slippage on max SOL).
 */
export async function buildPumpCreateAndBuyInstructions(args: {
  connection: Connection;
  input: PumpCreateInput;
  solAmountLamports: bigint;
}): Promise<PumpPreparedCreateAndBuy> {
  if (args.solAmountLamports <= BigInt(0)) {
    throw new Error('sol_amount_required');
  }
  const v = assertPumpCreateInput(args.input);
  const BN = loadPumpBn();
  const PUMP_SDK = getPumpSdkApi();
  const online = getOnlinePumpSdk(args.connection);

  const [global, feeConfig] = await Promise.all([
    online.fetchGlobal(),
    online.fetchFeeConfig(),
  ]);

  const solAmount = new BN(args.solAmountLamports.toString(10), 10);
  const tokenAmount = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: null,
    bondingCurve: null,
    amount: solAmount,
    quoteMint: new PublicKey(PUMP_NATIVE_MINT),
  });

  const instructions = await PUMP_SDK.createV2AndBuyInstructions({
    global,
    mint: v.mint,
    name: v.name,
    symbol: v.symbol,
    uri: v.uri,
    creator: v.creator,
    user: v.user,
    amount: tokenAmount,
    solAmount,
    mayhemMode: PUMP_CREATE_DEFAULTS.mayhemMode,
    holderReward: PUMP_CREATE_DEFAULTS.holderReward,
    cashback: PUMP_CREATE_DEFAULTS.cashback,
  });

  if (!Array.isArray(instructions) || instructions.length < 2) {
    throw new Error('pump_create_buy_empty_instructions');
  }

  const programId = instructions[0]!.programId.toBase58();
  if (programId !== PUMP_PROGRAM_ID_MAINNET) {
    throw new Error(`Unexpected Pump program id: ${programId}`);
  }
  if (programId !== getPumpProgramId().toBase58()) {
    throw new Error(`Pump SDK program id mismatch: ${programId}`);
  }

  return {
    instructions,
    mint: v.mint.toBase58(),
    creator: v.creator.toBase58(),
    user: v.user.toBase58(),
    name: v.name,
    symbol: v.symbol,
    uri: v.uri,
    programId,
    mayhemMode: false,
    holderReward: false,
    cashback: false,
    pair: 'SOL',
    solAmountLamports: args.solAmountLamports.toString(10),
    tokenAmountRaw: tokenAmount.toString(10),
  };
}
