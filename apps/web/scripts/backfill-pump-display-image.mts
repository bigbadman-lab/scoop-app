/**
 * One-off production backfill for B7ai mint display image.
 * Run: node --experimental-strip-types apps/web/scripts/backfill-pump-display-image.mts
 * Do not commit secrets. Safe to leave as ops script.
 */
import { createPool, applyDisplayImagePathToToken } from '@scoop/db';
import {
  createSupabaseTokenImageStorage,
  mirrorIpfsUriToTokenImage,
} from '@scoop/news';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const CHAIN = 900001;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const pool = createPool(process.env.DATABASE_URL);

  const before = await pool.query(
    `SELECT chain_id, token_address, name, symbol, image_uri, display_image_url, created_at
     FROM tokens WHERE chain_id = $1 AND token_address = $2`,
    [CHAIN, MINT],
  );
  const launch = await pool.query(
    `SELECT chain_id, token_address, market_source, launch_tx_hash, creator_id, launched_at
     FROM launches WHERE chain_id = $1 AND token_address = $2`,
    [CHAIN, MINT],
  );
  let pumpStatePresent = false;
  try {
    const tms = await pool.query(
      `SELECT 1 FROM pump_market_state WHERE chain_id = $1 AND mint = $2 LIMIT 1`,
      [CHAIN, MINT],
    );
    pumpStatePresent = tms.rows.length > 0;
  } catch {
    pumpStatePresent = false;
  }

  const row = before.rows[0] as
    | {
        chain_id: number;
        token_address: string;
        name: string;
        symbol: string;
        image_uri: string | null;
        display_image_url: string | null;
        created_at: unknown;
      }
    | undefined;

  console.log(
    JSON.stringify(
      {
        step: 'before',
        token: row
          ? {
              chain_id: row.chain_id,
              token_address: row.token_address,
              name: row.name,
              symbol: row.symbol,
              image_uri: row.image_uri,
              display_image_url: row.display_image_url,
              created_at: row.created_at,
            }
          : null,
        launch: launch.rows[0] ?? null,
        pump_market_state_present: pumpStatePresent,
      },
      null,
      2,
    ),
  );

  if (!row) {
    throw new Error('missing token row');
  }

  const existing = String(row.display_image_url ?? '').trim();
  if (existing && /^https:\/\//i.test(existing)) {
    console.log(
      JSON.stringify({
        step: 'after',
        status: 'already_present',
        display_image_url: existing,
        image_uri_unchanged: true,
      }),
    );
    await pool.end();
    return;
  }

  const imageUri = String(row.image_uri ?? '').trim();
  if (!/^ipfs:\/\//i.test(imageUri)) {
    throw new Error(`unsupported image_uri: ${imageUri.slice(0, 40)}`);
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
        gatewayPrefix,
        reason: mirrored.reason,
      }),
    );
  }
  if (!mirrored || !mirrored.ok) {
    throw new Error(
      `mirror failed: ${mirrored && !mirrored.ok ? mirrored.reason : 'unknown'}`,
    );
  }

  const write = await applyDisplayImagePathToToken(pool, {
    chainId: CHAIN,
    tokenAddress: MINT,
    displayImageUrl: mirrored.publicUrl,
  });

  const after = await pool.query(
    `SELECT display_image_url, image_uri FROM tokens WHERE chain_id = $1 AND token_address = $2`,
    [CHAIN, MINT],
  );
  const display = after.rows[0]?.display_image_url as string | null;

  console.log(
    JSON.stringify(
      {
        step: 'after',
        mirror: { ok: true, uploaded: mirrored.uploaded, cid: mirrored.cid },
        write,
        display_image_url: display,
        image_uri_unchanged: after.rows[0]?.image_uri === row.image_uri,
      },
      null,
      2,
    ),
  );

  if (display) {
    const head = await fetch(display, { method: 'HEAD' });
    console.log(
      JSON.stringify({
        step: 'http_head',
        status: head.status,
        host: new URL(display).host,
        has_token_image: display.includes('/token-image/'),
        has_ipfs_io: display.includes('ipfs.io'),
      }),
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
