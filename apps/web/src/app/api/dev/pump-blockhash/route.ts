import { NextResponse } from 'next/server';
import { isScoopPumpProbeEnabled } from '@/lib/launch/adapters/pump/probe-flag';
import { createSolanaConnection } from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';

/** Dev-only recent blockhash for Pump build/simulate. Never logs RPC URL. */
export async function GET() {
  if (!isScoopPumpProbeEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const connection = createSolanaConnection();
    const latest = await connection.getLatestBlockhash('confirmed');
    return NextResponse.json({
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'blockhash failed',
      },
      { status: 502 },
    );
  }
}
