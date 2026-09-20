import { NextResponse } from 'next/server';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import {
  buildPumpCreateInstruction,
  buildPumpCreateTransaction,
} from '@/lib/launch/adapters/pump/build-create';
import { isScoopPumpProbeEnabled } from '@/lib/launch/adapters/pump/probe-flag';
import { simulatePumpCreateTransaction } from '@/lib/launch/adapters/pump/simulate';
import { parseSolanaPublicKey } from '@/lib/solana/pubkey';
import { createSolanaConnection } from '@/lib/solana/rpc';

export const dynamic = 'force-dynamic';

type Body = {
  name?: string;
  symbol?: string;
  uri?: string;
  creator?: string;
  user?: string;
  /** Client mint pubkey only — never send the mint secret. */
  mint?: string;
};

/**
 * Dev-only: build create_v2 + simulate on SOLANA_RPC_URL. Never broadcasts.
 * Never accepts mint secret keys.
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

  const name = (body.name ?? '').trim();
  const symbol = (body.symbol ?? '').trim();
  const uri = (body.uri ?? '').trim();
  const creator = (body.creator ?? '').trim();
  const user = (body.user ?? creator).trim();
  const mintPk = (body.mint ?? '').trim();

  if (!parseSolanaPublicKey(creator) || !parseSolanaPublicKey(user)) {
    return NextResponse.json({ error: 'invalid_creator_or_user' }, { status: 400 });
  }
  if (mintPk && !parseSolanaPublicKey(mintPk)) {
    return NextResponse.json({ error: 'invalid_mint' }, { status: 400 });
  }

  try {
    const connection = createSolanaConnection();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');

    if (mintPk) {
      // Client-supplied mint pubkey: build ix with that mint, simulate without
      // mint partial-sign (secret never leaves the browser).
      const prepared = await buildPumpCreateInstruction({
        name,
        symbol,
        uri,
        creator,
        user,
        mint: mintPk,
      });
      const tx = new Transaction();
      tx.feePayer = new PublicKey(prepared.user);
      tx.recentBlockhash = blockhash;
      tx.add(prepared.instruction);

      const report = await simulatePumpCreateTransaction({
        connection,
        transaction: tx,
        prepared,
      });

      return NextResponse.json({
        ...report,
        preview: {
          network: 'mainnet-beta',
          creator: prepared.creator,
          mint: prepared.mint,
          pair: 'SOL',
          name: prepared.name,
          symbol: prepared.symbol,
          uri: prepared.uri,
          initialBuy: 'none',
          programId: prepared.programId,
          mayhemMode: false,
          holderReward: false,
          cashback: false,
          mintSource: 'client_pubkey',
        },
      });
    }

    // No client mint: ephemeral mint keypair for a fully partial-signed sim.
    const ephemeral = Keypair.generate();
    const built = await buildPumpCreateTransaction({
      input: {
        name,
        symbol,
        uri,
        creator,
        user,
        mint: ephemeral.publicKey.toBase58(),
      },
      mintKeypair: ephemeral,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
    });

    const report = await simulatePumpCreateTransaction({
      connection,
      transaction: built.transaction,
      prepared: built.prepared,
    });

    return NextResponse.json({
      ...report,
      preview: {
        network: 'mainnet-beta',
        creator: built.prepared.creator,
        mint: built.prepared.mint,
        pair: 'SOL',
        name: built.prepared.name,
        symbol: built.prepared.symbol,
        uri: built.prepared.uri,
        initialBuy: 'none',
        programId: built.prepared.programId,
        mayhemMode: false,
        holderReward: false,
        cashback: false,
        mintSource: 'server_ephemeral',
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: 'BLOCKED',
        error: err instanceof Error ? err.message : 'build/simulate failed',
      },
      { status: 502 },
    );
  }
}
