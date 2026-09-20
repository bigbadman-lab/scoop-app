import type { PublicKey, TransactionInstruction } from '@solana/web3.js';

/** Forced Gate C create defaults — SOL pair, no mayhem, no holder rewards, no cashback. */
export const PUMP_CREATE_DEFAULTS = {
  mayhemMode: false as const,
  holderReward: false as const,
  /** Deprecated by Pump — must stay false / omitted. */
  cashback: false as const,
  pair: 'SOL' as const,
  decimals: 6 as const,
} as const;

export const PUMP_FIELD_LIMITS = {
  nameMax: 32,
  symbolMax: 13,
  uriMax: 200,
} as const;

/** Official Pump program (create_v2). */
export const PUMP_PROGRAM_ID_MAINNET =
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' as const;

export const TOKEN_2022_PROGRAM_ID =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb' as const;

export type PumpCreateInput = {
  name: string;
  symbol: string;
  /** Metadata URI (SCOOP typically reuses pinned ipfs:// image URI). */
  uri: string;
  /** Connected Solana wallet — creator. */
  creator: string;
  /** Connected Solana wallet — fee payer / user (same as creator for MVP). */
  user: string;
  /** Mint public key (base58). Secret never sent here. */
  mint: string;
};

export type PumpCreateValidated = {
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  user: PublicKey;
  mint: PublicKey;
};

export type PumpPreparedCreate = {
  instruction: TransactionInstruction;
  mint: string;
  creator: string;
  user: string;
  name: string;
  symbol: string;
  uri: string;
  programId: string;
  mayhemMode: false;
  holderReward: false;
  cashback: false;
  pair: 'SOL';
};

export type PumpMintHandle = {
  /** Opaque attempt id for UI retry tracking — never the secret. */
  attemptId: string;
  mintPublicKey: string;
};

export type PumpSimulateReport = {
  ok: boolean;
  status: 'PASS' | 'BLOCKED';
  slot: number | null;
  unitsConsumed: number | null;
  error: string | null;
  logs: string[];
  checks: {
    pumpProgram: boolean;
    token2022: boolean;
    mintIsSigner: boolean;
    userIsSigner: boolean;
    accountCount: number;
  };
};
