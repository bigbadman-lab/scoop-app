import { NextResponse } from 'next/server';
import { createSolanaConnection } from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';

type Body = {
  signature?: string;
  blockhash?: string;
  lastValidBlockHeight?: number;
};

/**
 * Confirm a Pump create signature on Solana mainnet (server RPC).
 * Does not accept mint secrets. Used after wallet broadcast.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const signature = (body.signature ?? '').trim();
  if (!signature) {
    return NextResponse.json({ error: 'signature_required' }, { status: 400 });
  }

  try {
    const connection = createSolanaConnection();
    const latest = await connection.getLatestBlockhash('confirmed');
    const conf = await connection.confirmTransaction(
      {
        signature,
        blockhash: body.blockhash?.trim() || latest.blockhash,
        lastValidBlockHeight:
          typeof body.lastValidBlockHeight === 'number'
            ? body.lastValidBlockHeight
            : latest.lastValidBlockHeight,
      },
      'confirmed',
    );

    if (conf.value.err) {
      return NextResponse.json(
        {
          ok: false,
          status: 'failed',
          signature,
          error: conf.value.err,
        },
        { status: 200 },
      );
    }

    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      signature,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: 'uncertain',
        signature,
        error: err instanceof Error ? err.message : 'confirm_failed',
      },
      { status: 200 },
    );
  }
}
