import { NextResponse } from 'next/server';
import { getAuthenticatedAccountIdentity } from '@/lib/auth/session';
import {
  mapCreatorFeeError,
  readSolanaCreatorFeeSnapshot,
} from '@/lib/account/solana-creator-fees';
import { getSolUsdX18 } from '@/lib/market/spot';
import { getServerPool } from '@/lib/server/db';
import {
  createSolanaConnection,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const identity = getAuthenticatedAccountIdentity(request);
  if (!identity) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign in to view creator fees' },
      { status: 401 },
    );
  }
  if (identity.namespace !== 'solana' || identity.authMethod !== 'siws') {
    return NextResponse.json(
      {
        ok: false,
        code: 'SOLANA_SESSION_REQUIRED',
        error: 'Solana creator fees require a SIWS session',
      },
      { status: 403 },
    );
  }

  try {
    const connection = createSolanaConnection();
    const solUsdX18 = await getSolUsdX18();
    const snapshot = await readSolanaCreatorFeeSnapshot({
      connection,
      creator: identity.address,
      db: getServerPool(),
      solUsdX18,
    });
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    if (error instanceof SolanaRpcConfigError) {
      return NextResponse.json(
        { ok: false, code: 'solana_rpc_unavailable', error: 'Solana RPC unavailable' },
        { status: 503 },
      );
    }
    const mapped = mapCreatorFeeError(error);
    console.error('[account/solana/creator-fees]', mapped.code);
    return NextResponse.json(
      { ok: false, code: mapped.code, error: mapped.message },
      { status: 500 },
    );
  }
}
