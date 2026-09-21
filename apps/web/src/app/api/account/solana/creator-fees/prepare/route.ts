import { NextResponse } from 'next/server';
import { getAuthenticatedAccountIdentity } from '@/lib/auth/session';
import {
  mapCreatorFeeError,
  prepareSolanaCreatorFeeClaim,
} from '@/lib/account/solana-creator-fees';
import { getServerPool } from '@/lib/server/db';
import {
  createSolanaConnection,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Build an unsigned Pump creator-fee claim transaction for the SIWS wallet.
 * Creator/recipient are session-derived — body must not supply them.
 */
export async function POST(request: Request) {
  const identity = getAuthenticatedAccountIdentity(request);
  if (!identity) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign in to claim creator fees' },
      { status: 401 },
    );
  }
  if (identity.namespace !== 'solana' || identity.authMethod !== 'siws') {
    return NextResponse.json(
      {
        ok: false,
        code: 'SOLANA_SESSION_REQUIRED',
        error: 'Solana creator fee claims require a SIWS session',
      },
      { status: 403 },
    );
  }

  // Reject client-supplied creator/recipient overrides if present.
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (
      body.creator != null ||
      body.recipient != null ||
      body.address != null ||
      body.coinCreator != null
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: 'CLIENT_IDENTITY_FORBIDDEN',
          error: 'Creator identity must come from the SCOOP session',
        },
        { status: 400 },
      );
    }
  } catch {
    /* empty body ok */
  }

  try {
    const connection = createSolanaConnection();
    const prepared = await prepareSolanaCreatorFeeClaim({
      connection,
      creator: identity.address,
      db: getServerPool(),
    });
    return NextResponse.json({ ok: true, ...prepared });
  } catch (error) {
    if (error instanceof SolanaRpcConfigError) {
      return NextResponse.json(
        { ok: false, code: 'solana_rpc_unavailable', error: 'Solana RPC unavailable' },
        { status: 503 },
      );
    }
    const mapped = mapCreatorFeeError(error);
    const status =
      mapped.code === 'nothing_to_claim' || mapped.code === 'fee_sharing_unsupported'
        ? 409
        : 500;
    if (status === 500) {
      console.error('[account/solana/creator-fees/prepare]', mapped.code);
    }
    return NextResponse.json(
      { ok: false, code: mapped.code, error: mapped.message },
      { status },
    );
  }
}
