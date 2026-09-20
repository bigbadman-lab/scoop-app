import { NextResponse } from 'next/server';
import { Transaction } from '@solana/web3.js';
import { isScoopPumpProbeEnabled } from '@/lib/launch/adapters/pump/probe-flag';
import { simulatePumpCreateTransaction } from '@/lib/launch/adapters/pump/simulate';
import {
  PUMP_PROGRAM_ID_MAINNET,
  TOKEN_2022_PROGRAM_ID,
  type PumpPreparedCreate,
} from '@/lib/launch/adapters/pump/types';
import { createSolanaConnection } from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';

type Body = {
  /** Base64 serialized Transaction (mint may be partial-signed). */
  transactionBase64?: string;
  prepared?: Pick<
    PumpPreparedCreate,
    'mint' | 'creator' | 'user' | 'name' | 'symbol' | 'uri' | 'programId' | 'pair'
  >;
};

/**
 * Dev-only Pump create simulation — never broadcasts.
 * Requires NEXT_PUBLIC_SCOOP_PUMP_PROBE=1.
 */
export async function POST(request: Request) {
  if (!isScoopPumpProbeEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const b64 = (body.transactionBase64 ?? '').trim();
  if (!b64) {
    return NextResponse.json({ error: 'transactionBase64 required' }, { status: 400 });
  }

  let transaction: Transaction;
  try {
    transaction = Transaction.from(Buffer.from(b64, 'base64'));
  } catch {
    return NextResponse.json({ error: 'invalid_transaction' }, { status: 400 });
  }

  if (transaction.instructions.length !== 1) {
    return NextResponse.json(
      { error: 'Gate C expects a single create_v2 instruction' },
      { status: 400 },
    );
  }

  const ix = transaction.instructions[0]!;
  const prepared: PumpPreparedCreate = {
    instruction: ix,
    mint: body.prepared?.mint ?? '',
    creator: body.prepared?.creator ?? '',
    user: body.prepared?.user ?? '',
    name: body.prepared?.name ?? '',
    symbol: body.prepared?.symbol ?? '',
    uri: body.prepared?.uri ?? '',
    programId: ix.programId.toBase58(),
    mayhemMode: false,
    holderReward: false,
    cashback: false,
    pair: 'SOL',
  };

  if (prepared.programId !== PUMP_PROGRAM_ID_MAINNET) {
    return NextResponse.json(
      {
        ok: false,
        status: 'BLOCKED',
        error: `Unexpected program ${prepared.programId}`,
        expectedProgram: PUMP_PROGRAM_ID_MAINNET,
        token2022: TOKEN_2022_PROGRAM_ID,
      },
      { status: 400 },
    );
  }

  try {
    const connection = createSolanaConnection();
    const report = await simulatePumpCreateTransaction({
      connection,
      transaction,
      prepared,
    });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: 'BLOCKED',
        error: err instanceof Error ? err.message : 'simulation failed',
      },
      { status: 502 },
    );
  }
}
