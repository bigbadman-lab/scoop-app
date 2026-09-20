import { NextResponse } from 'next/server';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { isScoopSolanaWalletProbeEnabled } from '@/lib/solana/wallet-probe';
import { parseSolanaPublicKey } from '@/lib/solana/pubkey';
import {
  checkSolanaRpcHealth,
  createSolanaConnection,
  SOLANA_CLUSTER,
  SolanaRpcConfigError,
} from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';

/**
 * Dev-only Solana RPC probe — health + optional balance.
 * Requires NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE=1.
 * Never logs SOLANA_RPC_URL.
 */
export async function GET(request: Request) {
  if (!isScoopSolanaWalletProbeEnabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const health = await checkSolanaRpcHealth();
  const url = new URL(request.url);
  const addressRaw = (url.searchParams.get('address') ?? '').trim();

  if (!addressRaw) {
    return NextResponse.json({
      cluster: SOLANA_CLUSTER,
      rpc: health.ok ? 'PASS' : 'FAIL',
      slot: health.slot,
      error: health.error,
    });
  }

  const pubkey = parseSolanaPublicKey(addressRaw);
  if (!pubkey) {
    return NextResponse.json(
      {
        cluster: SOLANA_CLUSTER,
        rpc: health.ok ? 'PASS' : 'FAIL',
        slot: health.slot,
        error: 'Invalid Solana public key',
      },
      { status: 400 },
    );
  }

  if (!health.ok) {
    return NextResponse.json({
      cluster: SOLANA_CLUSTER,
      rpc: 'FAIL',
      slot: null,
      address: pubkey.toBase58(),
      balanceSol: null,
      error: health.error,
    });
  }

  try {
    const connection = createSolanaConnection();
    const lamports = await connection.getBalance(pubkey, 'confirmed');
    return NextResponse.json({
      cluster: SOLANA_CLUSTER,
      rpc: 'PASS',
      slot: health.slot,
      address: pubkey.toBase58(),
      balanceLamports: lamports,
      balanceSol: lamports / LAMPORTS_PER_SOL,
      error: null,
    });
  } catch (err) {
    const message =
      err instanceof SolanaRpcConfigError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Balance fetch failed';
    return NextResponse.json(
      {
        cluster: SOLANA_CLUSTER,
        rpc: 'FAIL',
        slot: health.slot,
        address: pubkey.toBase58(),
        balanceSol: null,
        error: message,
      },
      { status: 502 },
    );
  }
}
