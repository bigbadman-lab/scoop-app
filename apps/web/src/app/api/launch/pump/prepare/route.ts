import { NextResponse } from 'next/server';
import { PublicKey, Transaction } from '@solana/web3.js';
import { buildPumpCreateInstruction } from '@/lib/launch/adapters/pump/build-create';
import { validatePumpCreateInput } from '@/lib/launch/adapters/pump/validation';
import { createSolanaConnection } from '@/lib/solana/rpc';
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

/**
 * Public Pump prepare — builds unsigned create_v2 tx (mint pubkey only).
 * Client partial-signs mint + wallet signs/broadcasts. Never accepts mint secret.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const input = {
    name: (body.name ?? '').trim(),
    symbol: (body.symbol ?? '').trim(),
    uri: (body.uri ?? '').trim(),
    creator: (body.creator ?? '').trim(),
    user: (body.user ?? body.creator ?? '').trim(),
    mint: (body.mint ?? '').trim(),
  };

  const errors = validatePumpCreateInput(input);
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: 'validation_failed', errors }, { status: 400 });
  }

  try {
    const connection = createSolanaConnection();
    const creatorPk = new PublicKey(input.creator);
    const bal = await connection.getBalance(creatorPk, 'confirmed');
    if (BigInt(bal) < PUMP_MIN_SOL_LAMPORTS) {
      return NextResponse.json(
        {
          error: 'insufficient_sol',
          message:
            'Insufficient SOL for Pump create (need ~0.015 SOL for rent and fees).',
          lamports: bal,
        },
        { status: 400 },
      );
    }

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');

    const prepared = await buildPumpCreateInstruction(input);
    const tx = new Transaction();
    tx.feePayer = new PublicKey(prepared.user);
    tx.recentBlockhash = blockhash;
    tx.add(prepared.instruction);

    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return NextResponse.json({
      transactionBase64: Buffer.from(serialized).toString('base64'),
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
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'prepare_failed',
      },
      { status: 502 },
    );
  }
}
