/**
 * Production repair: set PONS price_quote from on-curve reserves when spot is
 * zero, then derive USD/FDV from existing quote_price_snapshots (no fabrication).
 *
 * Run from repo root with env loaded:
 *   node --experimental-strip-types apps/indexer/scripts/repair-pons-market-usd.mts
 */
import { createPublicClient, http, parseAbi } from 'viem';
import { createPool } from '@scoop/db';
import {
  curveSyntheticPoolId,
  fdvUsdX18FromPrice,
  normalizeAddress,
  normalizeBytes32,
  priceUsdX18FromQuote,
} from '@scoop/shared';

const CHAIN = 4663;

const TARGETS = [
  {
    token: '0x4d35b131c2463ffb9cb2435e6df85d287f494b8b',
    curve: '0x220726bc96f67558b54ac468669a870e3bcf95c9',
  },
  {
    token: '0xa3f47a8a3032707b8bd414e96beebe82c97b4336',
    curve: '0x8f248adea86040ab64dac806d96265da74285b69',
  },
] as const;

function curvePrice(quoteReserve: bigint, tokenReserve: bigint): bigint {
  if (tokenReserve <= 0n) return 0n;
  return (quoteReserve * 10n ** 18n) / tokenReserve;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const rpc =
    process.env.ROBINHOOD_FALLBACK_RPC_URL ||
    process.env.ROBINHOOD_RPC_URL ||
    process.env.RPC_URL;
  if (!rpc) throw new Error('RHC RPC required');

  const pool = createPool(process.env.DATABASE_URL);
  const client = createPublicClient({ transport: http(rpc) });
  const curveAbi = parseAbi([
    'function quoteReserve() view returns (uint256)',
    'function tokenReserve() view returns (uint256)',
  ]);

  for (const t of TARGETS) {
    const token = normalizeAddress(t.token);
    const before = await pool.query(
      `SELECT m.price_quote_x18::text AS price_quote_x18,
              m.price_usd_x18::text AS price_usd_x18,
              m.fdv_usd_x18::text AS fdv_usd_x18,
              m.quote_usd_x18::text AS quote_usd_x18,
              m.pool_id,
              l.quote_asset,
              t.total_supply_raw::text AS total_supply_raw,
              t.decimals,
              t.symbol
       FROM token_market_state m
       JOIN launches l ON l.chain_id=m.chain_id AND l.token_address=m.token_address
       JOIN tokens t ON t.chain_id=m.chain_id AND t.token_address=m.token_address
       WHERE m.chain_id=$1 AND m.token_address=$2`,
      [CHAIN, token],
    );
    const row = before.rows[0] as
      | {
          price_quote_x18: string;
          price_usd_x18: string | null;
          fdv_usd_x18: string | null;
          quote_usd_x18: string | null;
          pool_id: string;
          quote_asset: string;
          total_supply_raw: string;
          decimals: number;
          symbol: string;
        }
      | undefined;
    console.log(JSON.stringify({ step: 'before', token, market: row ?? null }));
    if (!row) throw new Error(`missing market row ${token}`);

    const [quoteReserve, tokenReserve] = await Promise.all([
      client.readContract({
        address: t.curve as `0x${string}`,
        abi: curveAbi,
        functionName: 'quoteReserve',
      }),
      client.readContract({
        address: t.curve as `0x${string}`,
        abi: curveAbi,
        functionName: 'tokenReserve',
      }),
    ]);
    const reservePrice = curvePrice(quoteReserve, tokenReserve);
    let priceQuoteX18 = BigInt(row.price_quote_x18);
    if (priceQuoteX18 === 0n && reservePrice > 0n) {
      priceQuoteX18 = reservePrice;
    }

    const snap = await pool.query(
      `SELECT price_usd_x18::text AS price_usd_x18, observed_at
       FROM quote_price_snapshots
       WHERE chain_id = $1 AND quote_asset = $2
       ORDER BY observed_at DESC LIMIT 1`,
      [CHAIN, normalizeAddress(row.quote_asset)],
    );
    const snapRow = snap.rows[0] as
      | { price_usd_x18: string; observed_at: Date }
      | undefined;

    let quoteUsdX18: bigint | null =
      snapRow != null ? BigInt(snapRow.price_usd_x18) : null;
    let priceUsdX18: bigint | null = null;
    let fdvUsdX18: bigint | null = null;
    if (quoteUsdX18 != null && quoteUsdX18 > 0n) {
      priceUsdX18 = priceUsdX18FromQuote({
        priceQuoteX18,
        quoteUsdX18,
      });
      fdvUsdX18 = fdvUsdX18FromPrice({
        priceUsdX18,
        totalSupplyRaw: BigInt(row.total_supply_raw),
        tokenDecimals: Number(row.decimals),
      });
    }

    const poolId = normalizeBytes32(
      row.pool_id || curveSyntheticPoolId(t.curve),
    );

    await pool.query(
      `UPDATE token_market_state SET
         price_quote_x18 = $3,
         quote_usd_x18 = $4,
         price_usd_x18 = $5,
         fdv_usd_x18 = $6,
         pool_id = COALESCE(NULLIF(pool_id, ''), $7),
         updated_at = NOW()
       WHERE chain_id = $1 AND token_address = $2`,
      [
        CHAIN,
        token,
        priceQuoteX18.toString(),
        quoteUsdX18?.toString() ?? null,
        priceUsdX18?.toString() ?? null,
        fdvUsdX18?.toString() ?? null,
        poolId,
      ],
    );

    const after = await pool.query(
      `SELECT price_quote_x18::text, price_usd_x18::text, fdv_usd_x18::text,
              quote_usd_x18::text
       FROM token_market_state WHERE chain_id=$1 AND token_address=$2`,
      [CHAIN, token],
    );

    console.log(
      JSON.stringify({
        step: 'after',
        token,
        symbol: row.symbol,
        quoteAsset: row.quote_asset,
        reservePriceQuoteX18: reservePrice.toString(),
        quoteReserve: quoteReserve.toString(),
        tokenReserve: tokenReserve.toString(),
        snapshotObservedAt: snapRow?.observed_at ?? null,
        market: after.rows[0],
      }),
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
