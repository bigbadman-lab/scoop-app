/**
 * Production backfill: mirror PONS RHC token images into token-image storage.
 * Run: node --experimental-strip-types apps/web/scripts/backfill-pons-display-images.mts
 */
import { createPool, applyDisplayImagePathToToken } from '@scoop/db';
import {
  createSupabaseTokenImageStorage,
  mirrorIpfsUriToTokenImage,
} from '@scoop/news';

const CHAIN = 4663;
const TOKENS = [
  '0x4d35b131c2463ffb9cb2435e6df85d287f494b8b',
  '0xa3f47a8a3032707b8bd414e96beebe82c97b4336',
] as const;

async function backfillOne(
  pool: ReturnType<typeof createPool>,
  tokenAddress: string,
): Promise<void> {
  const before = await pool.query(
    `SELECT token_address, symbol, image_uri, display_image_url
     FROM tokens WHERE chain_id = $1 AND token_address = $2`,
    [CHAIN, tokenAddress],
  );
  const row = before.rows[0] as
    | {
        token_address: string;
        symbol: string;
        image_uri: string | null;
        display_image_url: string | null;
      }
    | undefined;

  console.log(
    JSON.stringify({
      step: 'before',
      token: row ?? null,
    }),
  );

  if (!row) throw new Error(`missing token ${tokenAddress}`);

  const existing = String(row.display_image_url ?? '').trim();
  if (existing && /^https:\/\//i.test(existing)) {
    console.log(
      JSON.stringify({
        step: 'after',
        tokenAddress,
        status: 'already_present',
        display_image_url: existing,
      }),
    );
    return;
  }

  const imageUri = String(row.image_uri ?? '').trim();
  if (!/^ipfs:\/\//i.test(imageUri)) {
    throw new Error(`unsupported image_uri for ${tokenAddress}`);
  }

  const storage = createSupabaseTokenImageStorage();
  const gateways = [
    'https://gateway.pinata.cloud/ipfs',
    'https://ipfs.io/ipfs',
    'https://dweb.link/ipfs',
  ];
  let mirrored: Awaited<ReturnType<typeof mirrorIpfsUriToTokenImage>> | null =
    null;
  for (const gatewayPrefix of gateways) {
    mirrored = await mirrorIpfsUriToTokenImage({
      imageUri,
      storage,
      gatewayPrefix,
    });
    if (mirrored.ok) break;
    console.warn(
      JSON.stringify({
        step: 'mirror_retry',
        tokenAddress,
        gatewayPrefix,
        reason: mirrored.reason,
      }),
    );
  }
  if (!mirrored || !mirrored.ok) {
    throw new Error(
      `mirror failed for ${tokenAddress}: ${mirrored && !mirrored.ok ? mirrored.reason : 'unknown'}`,
    );
  }

  const write = await applyDisplayImagePathToToken(pool, {
    chainId: CHAIN,
    tokenAddress,
    displayImageUrl: mirrored.publicUrl,
  });

  const after = await pool.query(
    `SELECT display_image_url, image_uri FROM tokens WHERE chain_id = $1 AND token_address = $2`,
    [CHAIN, tokenAddress],
  );
  const display = after.rows[0]?.display_image_url as string | null;
  let httpStatus: number | null = null;
  if (display) {
    const head = await fetch(display, { method: 'HEAD' });
    httpStatus = head.status;
  }

  console.log(
    JSON.stringify({
      step: 'after',
      tokenAddress,
      symbol: row.symbol,
      write,
      display_image_url: display,
      image_uri_unchanged: after.rows[0]?.image_uri === row.image_uri,
      http_head: httpStatus,
    }),
  );
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = createPool(process.env.DATABASE_URL);
  for (const token of TOKENS) {
    await backfillOne(pool, token);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
