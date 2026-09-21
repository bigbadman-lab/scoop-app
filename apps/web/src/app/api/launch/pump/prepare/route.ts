import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { PublicKey, Transaction } from '@solana/web3.js';
import { buildPumpCreateInstruction } from '@/lib/launch/adapters/pump/build-create';
import { buildPumpCreateAndBuyInstructions } from '@/lib/launch/adapters/pump/build-create-and-buy';
import {
  PUMP_SDK_EXPORT_MISSING,
  PUMP_SDK_UNAVAILABLE,
} from '@/lib/launch/adapters/pump/sdk';
import { validatePumpCreateInput } from '@/lib/launch/adapters/pump/validation';
import {
  createSolanaConnection,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';
import {
  INSUFFICIENT_SOL_FOR_LAUNCH_AND_DEV_BUY,
  PUMP_MIN_SOL_LAMPORTS,
} from '@/lib/launch/pump-constants';
import {
  parseSolDevBuyLamports,
  requiredSolForPumpLaunch,
} from '@/lib/launch/pump-dev-buy';

export const dynamic = 'force-dynamic';

type Body = {
  name?: string;
  symbol?: string;
  uri?: string;
  creator?: string;
  user?: string;
  mint?: string;
  /** Human SOL string or integer lamports string — server prefers `devBuySol`. */
  devBuySol?: string | number | null;
  /** Canonical lamports when client already converted (integer string). */
  devBuyLamports?: string | number | null;
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
  | typeof INSUFFICIENT_SOL_FOR_LAUNCH_AND_DEV_BUY
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
    mode: 'create' | 'create_and_buy';
    solAmountLamports: string;
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

function parseDevBuyLamportsFromBody(body: Body):
  | { ok: true; lamports: bigint }
  | { ok: false; error: string } {
  if (body.devBuyLamports != null && body.devBuyLamports !== '') {
    const raw = String(body.devBuyLamports).trim();
    if (!/^\d+$/.test(raw)) {
      return { ok: false, error: 'devBuyLamports must be a non-negative integer.' };
    }
    return { ok: true, lamports: BigInt(raw) };
  }
  if (body.devBuySol == null || body.devBuySol === '') {
    return { ok: true, lamports: BigInt(0) };
  }
  const parsed = parseSolDevBuyLamports(String(body.devBuySol));
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, lamports: parsed.lamports };
}

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
  mode?: string;
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
      mode: event.mode ?? null,
      elapsedMs: event.elapsedMs,
    }),
  );
}

/**
 * Public Pump prepare — builds unsigned create_v2 (or create+buy) tx.
 * Mint pubkey only; client partial-signs mint + wallet signs/broadcasts.
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

  const errors: Record<string, string> = {
    ...validatePumpCreateInput(input),
  };
  const buyParsed = parseDevBuyLamportsFromBody(body);
  if (!buyParsed.ok) {
    errors.devBuySol = buyParsed.error;
  }
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

  const solAmountLamports = buyParsed.ok ? buyParsed.lamports : BigInt(0);
  const mode = solAmountLamports > BigInt(0) ? 'create_and_buy' : 'create';

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
    const required =
      solAmountLamports > BigInt(0)
        ? requiredSolForPumpLaunch(solAmountLamports)
        : PUMP_MIN_SOL_LAMPORTS;
    if (BigInt(bal) < required) {
      const elapsedMs = Date.now() - started;
      const errorCode =
        solAmountLamports > BigInt(0)
          ? INSUFFICIENT_SOL_FOR_LAUNCH_AND_DEV_BUY
          : 'insufficient_sol';
      logPrepare({
        requestId,
        stage,
        ok: false,
        error: errorCode,
        creator,
        mint,
        elapsedMs,
        mode,
      });
      const err: PrepareErr = {
        ok: false,
        error: errorCode,
        message:
          solAmountLamports > BigInt(0)
            ? 'Insufficient SOL for Pump create and DEV BUY.'
            : 'Insufficient SOL for Pump create (need ~0.015 SOL for rent and fees).',
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
    let preparedMeta: PrepareOk['prepared'];
    let instructions: import('@solana/web3.js').TransactionInstruction[];

    if (solAmountLamports > BigInt(0)) {
      const prepared = await buildPumpCreateAndBuyInstructions({
        connection,
        input,
        solAmountLamports,
      });
      instructions = prepared.instructions;
      preparedMeta = {
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
        mode: 'create_and_buy',
        solAmountLamports: prepared.solAmountLamports,
      };
    } else {
      const prepared = await buildPumpCreateInstruction(input);
      instructions = [prepared.instruction];
      preparedMeta = {
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
        mode: 'create',
        solAmountLamports: '0',
      };
    }

    stage = 'serialize';
    let transactionBase64: string;
    try {
      const tx = new Transaction();
      tx.feePayer = new PublicKey(preparedMeta.user);
      tx.recentBlockhash = blockhash;
      for (const ix of instructions) tx.add(ix);
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
      mint: preparedMeta.mint,
      elapsedMs,
      mode,
    });

    const ok: PrepareOk = {
      ok: true,
      transactionBase64,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      creatorLamports: bal,
      prepared: preparedMeta,
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
      mode,
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
