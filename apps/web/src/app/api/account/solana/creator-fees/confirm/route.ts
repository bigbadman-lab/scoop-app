/**
 * Confirm a Solana creator-fee claim signature (no rebroadcast).
 */

import { NextResponse } from 'next/server';
import { getAuthenticatedAccountIdentity } from '@/lib/auth/session';
import {
  createSolanaConnection,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const identity = getAuthenticatedAccountIdentity(request);
  if (!identity || identity.namespace !== 'solana') {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'SIWS required' },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    signature?: string;
  };
  const signature =
    typeof body.signature === 'string' ? body.signature.trim() : '';
  if (!signature || signature.length < 32) {
    return NextResponse.json(
      { ok: false, code: 'invalid_signature', error: 'Signature required' },
      { status: 400 },
    );
  }

  try {
    const connection = createSolanaConnection();
    const status = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const value = status?.value?.[0];
    if (!value) {
      return NextResponse.json({
        ok: true,
        status: 'uncertain' as const,
        signature,
      });
    }
    if (value.err) {
      return NextResponse.json({
        ok: true,
        status: 'failed' as const,
        signature,
      });
    }
    const conf = value.confirmationStatus;
    if (conf === 'confirmed' || conf === 'finalized') {
      return NextResponse.json({
        ok: true,
        status: 'confirmed' as const,
        signature,
      });
    }
    return NextResponse.json({
      ok: true,
      status: 'uncertain' as const,
      signature,
    });
  } catch (error) {
    if (error instanceof SolanaRpcConfigError) {
      return NextResponse.json(
        { ok: false, code: 'solana_rpc_unavailable', error: 'Solana RPC unavailable' },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      status: 'uncertain' as const,
      signature,
    });
  }
}
