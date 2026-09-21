import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PublicKey, Transaction } from '@solana/web3.js';
import { buildPumpCreateInstruction } from '@/lib/launch/adapters/pump/build-create';
import {
  PUMP_SDK_EXPORT_MISSING,
  PUMP_SDK_UNAVAILABLE,
} from '@/lib/launch/adapters/pump/sdk';
import { validatePumpCreateInput } from '@/lib/launch/adapters/pump/validation';
import {
  createSolanaConnection,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';
import { PUMP_MIN_SOL_LAMPORTS } from '@/lib/launch/pump-constants';

export const dynamic = 'force-dynamic';

type Body = {
  name?: string;
  symbol?: string;
  uri?: string;
  creator?: string;
  user?: string;
  mint?: string;
};

export type PumpPrepareStage =
  | 'parse'
  | 'validate'
  | 'rpc_connect'
  | 'get_balance'
  | 'balance_gate'
  | 'get_blockhash'
  | 'pump_sdk_build'
  | 'serialize'
  | 'response';

export type PumpPrepareErrorCode =
  | 'invalid_json'
  | 'validation_failed'
  | 'solana_rpc_unavailable'
  | 'solana_rpc_balance_failed'
  | 'insufficient_sol'
  | 'solana_rpc_blockhash_failed'
  | 'pump_sdk_unavailable'
  | 'pump_sdk_export_missing'
  | 'pump_prepare_build_failed'
  | 'pump_prepare_serialize_failed'
  | 'prepare_failed';

type PrepareOk = {
  ok: true;
  transactionBase64: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
  creatorLamports: number;
  prepared: {
    mint: string;
    creator: string;
    user: string;
    name: string;
    symbol: string;
    uri: string;
    programId: string;
    pair: string;
    mayhemMode: boolean;
    holderReward: boolean;
    cashback: boolean;
  };
  requestId: string;
  elapsedMs: number;
};

type PrepareErr = {
  ok: false;
  error: PumpPrepareErrorCode;
  message?: string;
  errors?: Record<string, string>;
  lamports?: number;
  stage: PumpPrepareStage;
  requestId: string;
  elapsedMs: number;
};

function classifyPrepareError(err: unknown): {
  code: PumpPrepareErrorCode;
  status: number;
  message: string;
} {
  const message = err instanceof Error ? err.message : 'prepare_failed';
  if (err instanceof SolanaRpcConfigError || message === 'solana_rpc_unavailable') {
    return { code: 'solana_rpc_unavailable', status: 503, message };
  }
  if (
    message === PUMP_SDK_UNAVAILABLE ||
    message.startsWith(`${PUMP_SDK_UNAVAILABLE}:`)
  ) {
    return { code: 'pump_sdk_unavailable', status: 502, message };
  }
  if (message === PUMP_SDK_EXPORT_MISSING) {
    return { code: 'pump_sdk_export_missing', status: 502, message };
  }
  if (message === 'solana_rpc_balance_failed') {
    return { code: 'solana_rpc_balance_failed', status: 502, message };
  }
  if (message === 'solana_rpc_blockhash_failed') {
    return { code: 'solana_rpc_blockhash_failed', status: 502, message };
  }
  if (message === 'pump_prepare_serialize_failed') {
    return { code: 'pump_prepare_serialize_failed', status: 502, message };
  }
  if (/void 0|is not a function|Cannot find module .*pump-sdk/i.test(message)) {
    return { code: 'pump_sdk_unavailable', status: 502, message: PUMP_SDK_UNAVAILABLE };
  }
  return { code: 'pump_prepare_build_failed', status: 502, message };
}

function logPrepare(event: {
  requestId: string;
  stage: PumpPrepareStage;
  ok: boolean;
  error?: string;
  creator?: string;
  mint?: string;
  elapsedMs: number;
}): void {
  console.info(
    JSON.stringify({
      scope: 'pump_prepare',
      requestId: event.requestId,
      stage: event.stage,
      ok: event.ok,
      error: event.error ?? null,
      creator: event.creator ?? null,
      mint: event.mint ?? null,
      elapsedMs: event.elapsedMs,
    }),
  );
}

/**
 * Public Pump prepare — builds unsigned create_v2 tx (mint pubkey only).
 * Client partial-signs mint + wallet signs/broadcasts. Never accepts mint secret.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const requestId = randomUUID();
  let stage: PumpPrepareStage = 'parse';
  let creator = '';
  let mint = '';

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    const elapsedMs = Date.now() - started;
    logPrepare({
      requestId,
      stage: 'parse',
      ok: false,
      error: 'invalid_json',
      elapsedMs,
    });
    const err: PrepareErr = {
      ok: false,
      error: 'invalid_json',
      stage: 'parse',
      requestId,
      elapsedMs,
    };
    return NextResponse.json(err, { status: 400 });
  }

  stage = 'validate';
  const input = {
    name: (body.name ?? '').trim(),
    symbol: (body.symbol ?? '').trim(),
    uri: (body.uri ?? '').trim(),
    creator: (body.creator ?? '').trim(),
    user: (body.user ?? body.creator ?? '').trim(),
    mint: (body.mint ?? '').trim(),
  };
  creator = input.creator;
  mint = input.mint;

  const errors = validatePumpCreateInput(input);
  if (Object.keys(errors).length) {
    const elapsedMs = Date.now() - started;
    logPrepare({
      requestId,
      stage,
      ok: false,
      error: 'validation_failed',
      creator,
      mint,
      elapsedMs,
    });
    const err: PrepareErr = {
      ok: false,
      error: 'validation_failed',
      errors,
      stage,
      requestId,
      elapsedMs,
    };
    return NextResponse.json(err, { status: 400 });
  }

  try {
    stage = 'rpc_connect';
    const connection = createSolanaConnection();
    const creatorPk = new PublicKey(input.creator);

    stage = 'get_balance';
    let bal: number;
    try {
      bal = await connection.getBalance(creatorPk, 'confirmed');
    } catch {
      throw new Error('solana_rpc_balance_failed');
    }

    stage = 'balance_gate';
    if (BigInt(bal) < PUMP_MIN_SOL_LAMPORTS) {
      const elapsedMs = Date.now() - started;
      logPrepare({
        requestId,
        stage,
        ok: false,
        error: 'insufficient_sol',
        creator,
        mint,
        elapsedMs,
      });
      const err: PrepareErr = {
        ok: false,
        error: 'insufficient_sol',
        message:
          'Insufficient SOL for Pump create (need ~0.015 SOL for rent and fees).',
        lamports: bal,
        stage,
        requestId,
        elapsedMs,
      };
      return NextResponse.json(err, { status: 400 });
    }

    stage = 'get_blockhash';
    let blockhash: string;
    let lastValidBlockHeight: number;
    try {
      ({ blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash('confirmed'));
    } catch {
      throw new Error('solana_rpc_blockhash_failed');
    }

    stage = 'pump_sdk_build';
    const prepared = await buildPumpCreateInstruction(input);

    stage = 'serialize';
    let transactionBase64: string;
    try {
      const tx = new Transaction();
      tx.feePayer = new PublicKey(prepared.user);
      tx.recentBlockhash = blockhash;
      tx.add(prepared.instruction);
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      transactionBase64 = Buffer.from(serialized).toString('base64');
    } catch {
      throw new Error('pump_prepare_serialize_failed');
    }

    stage = 'response';
    const elapsedMs = Date.now() - started;
    logPrepare({
      requestId,
      stage,
      ok: true,
      creator,
      mint: prepared.mint,
      elapsedMs,
    });

    const ok: PrepareOk = {
      ok: true,
      transactionBase64,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      creatorLamports: bal,
      prepared: {
        mint: prepared.mint,
        creator: prepared.creator,
        user: prepared.user,
        name: prepared.name,
        symbol: prepared.symbol,
        uri: prepared.uri,
        programId: prepared.programId,
        pair: prepared.pair,
        mayhemMode: prepared.mayhemMode,
        holderReward: prepared.holderReward,
        cashback: prepared.cashback,
      },
      requestId,
      elapsedMs,
    };
    return NextResponse.json(ok);
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const classified = classifyPrepareError(err);
    logPrepare({
      requestId,
      stage,
      ok: false,
      error: classified.code,
      creator,
      mint,
      elapsedMs,
    });
    const body: PrepareErr = {
      ok: false,
      error: classified.code,
      message: classified.message,
      stage,
      requestId,
      elapsedMs,
    };
    return NextResponse.json(body, { status: classified.status });
  }
}
