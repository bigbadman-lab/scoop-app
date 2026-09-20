import {
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { getPumpProgramId, getPumpSdkApi } from '@/lib/launch/adapters/pump/sdk';
import { assertPumpCreateInput } from '@/lib/launch/adapters/pump/validation';
import {
  PUMP_CREATE_DEFAULTS,
  PUMP_PROGRAM_ID_MAINNET,
  TOKEN_2022_PROGRAM_ID,
  type PumpCreateInput,
  type PumpPreparedCreate,
} from '@/lib/launch/adapters/pump/types';

/**
 * Build the official SOL-paired create_v2 instruction.
 * Forces mayhemMode/holderReward/cashback false; omits quoteMint.
 */
export async function buildPumpCreateInstruction(
  input: PumpCreateInput,
): Promise<PumpPreparedCreate> {
  const v = assertPumpCreateInput(input);
  const PUMP_SDK = getPumpSdkApi();

  const instruction = await PUMP_SDK.createV2Instruction({
    mint: v.mint,
    name: v.name,
    symbol: v.symbol,
    uri: v.uri,
    creator: v.creator,
    user: v.user,
    mayhemMode: PUMP_CREATE_DEFAULTS.mayhemMode,
    holderReward: PUMP_CREATE_DEFAULTS.holderReward,
    cashback: PUMP_CREATE_DEFAULTS.cashback,
    // quoteMint omitted → SOL-paired
  });

  const programId = instruction.programId.toBase58();
  if (programId !== PUMP_PROGRAM_ID_MAINNET) {
    throw new Error(`Unexpected Pump program id: ${programId}`);
  }
  if (programId !== getPumpProgramId().toBase58()) {
    throw new Error(`Pump SDK program id mismatch: ${programId}`);
  }

  return {
    instruction,
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
  };
}

export type BuiltPumpCreateTx = {
  /** Partially signed by mint only — wallet has not signed; do not broadcast from Gate C. */
  transaction: Transaction;
  prepared: PumpPreparedCreate;
  recentBlockhash: string;
  lastValidBlockHeight: number;
};

/**
 * Assemble create tx: fee payer = user, mint partial-signs.
 * Caller supplies mint Keypair from mint-lifecycle (never from server).
 */
export async function buildPumpCreateTransaction(args: {
  input: PumpCreateInput;
  mintKeypair: Keypair;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}): Promise<BuiltPumpCreateTx> {
  const prepared = await buildPumpCreateInstruction(args.input);

  if (prepared.mint !== args.mintKeypair.publicKey.toBase58()) {
    throw new Error('Mint keypair does not match prepared mint public key.');
  }

  const tx = new Transaction();
  tx.feePayer = new PublicKey(prepared.user);
  tx.recentBlockhash = args.recentBlockhash;
  tx.add(prepared.instruction);
  // Mint must sign create_v2. Wallet signs later via Reown provider.
  tx.partialSign(args.mintKeypair);

  return {
    transaction: tx,
    prepared,
    recentBlockhash: args.recentBlockhash,
    lastValidBlockHeight: args.lastValidBlockHeight,
  };
}

export function inspectCreateInstructionAccounts(ix: TransactionInstruction): {
  pumpProgram: boolean;
  token2022: boolean;
  mintIsSigner: boolean;
  userIsSigner: boolean;
  accountCount: number;
  writableSigners: string[];
} {
  const token2022 = new PublicKey(TOKEN_2022_PROGRAM_ID);
  const signers = ix.keys.filter((k) => k.isSigner);
  return {
    pumpProgram: ix.programId.toBase58() === PUMP_PROGRAM_ID_MAINNET,
    token2022: ix.keys.some((k) => k.pubkey.equals(token2022)),
    mintIsSigner: signers.length >= 1,
    userIsSigner: signers.length >= 2,
    accountCount: ix.keys.length,
    writableSigners: signers.map((k) => k.pubkey.toBase58()),
  };
}
