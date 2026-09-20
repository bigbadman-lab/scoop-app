import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  SOLANA_MAINNET_CHAIN_ID,
  normalizeAssetAddress,
  normalizeSolanaSignature,
} from '@scoop/shared';
import { upsertPumpMarket } from '@scoop/db';
import { serverDb } from '@/lib/server/queries';

export const dynamic = 'force-dynamic';

type Body = {
  mint?: string;
  signature?: string;
  creatorWallet?: string;
  name?: string;
  symbol?: string;
  description?: string;
  imageUri?: string;
  metadataUri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  launchedAt?: number;
  launchSlot?: number | null;
};

function assertSolanaPubkey(label: string, raw: string): string {
  try {
    return new PublicKey(raw.trim()).toBase58();
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}

/**
 * Persist a confirmed Pump create as a SCOOP market, then return the token route.
 * Idempotent by mint + signature. No EVM indexer dependency.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  try {
    const mint = assertSolanaPubkey('mint', body.mint ?? '');
    const creatorWallet = assertSolanaPubkey(
      'creatorWallet',
      body.creatorWallet ?? '',
    );
    const signature = normalizeSolanaSignature(body.signature ?? '');
    // Cross-check shared normalizer (shape) matches PublicKey canonical form.
    normalizeAssetAddress({ chain: 'solana', address: mint });

    const name = (body.name ?? '').trim();
    const symbol = (body.symbol ?? '').trim();
    if (!name || !symbol) {
      return NextResponse.json(
        { error: 'name_and_symbol_required' },
        { status: 400 },
      );
    }

    const result = await upsertPumpMarket(serverDb(), {
      mint,
      signature,
      creatorWallet,
      name,
      symbol,
      description: body.description,
      imageUri: body.imageUri,
      metadataUri: body.metadataUri,
      twitter: body.twitter,
      telegram: body.telegram,
      website: body.website,
      launchedAt: body.launchedAt,
      launchSlot: body.launchSlot,
    });

    return NextResponse.json({
      ok: true,
      chainId: result.chainId,
      chain: 'solana',
      provider: 'pump',
      marketSource: 'pump',
      mint: result.mint,
      signature: result.signature,
      created: result.created,
      tokenPath: `/token/${result.mint}`,
      productChainId: SOLANA_MAINNET_CHAIN_ID,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'persist_failed';
    const status = /already persisted|Invalid /.test(message) ? 409 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
