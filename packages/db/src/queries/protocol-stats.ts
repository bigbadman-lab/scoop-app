import type { Queryable } from '../types.js';
import { HIDDEN_PRODUCTION_CANARY_SQL } from './hidden-production-canaries.js';
import { formatX18 } from '../decimal.js';

/** Native ETH quote / fee asset (Uniswap native). */
const NATIVE_ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('division by zero');
  return (a * b) / denominator;
}

function notionalUsdX18FromQuoteAmount(args: {
  quoteAmountRaw: bigint;
  quoteUsdX18: bigint;
  quoteDecimals: number;
}): bigint {
  return mulDiv(
    args.quoteAmountRaw,
    args.quoteUsdX18,
    10n ** BigInt(args.quoteDecimals),
  );
}

export type ProtocolFeeSemantics = 'distributed_marked_to_market';

export type ProtocolFeeCoverage = 'complete' | 'partial' | 'unavailable' | 'empty';

export type ProtocolStats = {
  marketsLaunched: number;
  totalTrades: number;
  /** Decimal USD string for display helpers; null if no priced trades. */
  totalVolumeUsd: string | null;
  totalVolumeUsdX18: string | null;
  tradesMissingUsd: number;
  /**
   * Trading fees that have been collected and distributed (all buckets),
   * marked to USD at latest quote oracle prices. Not accrued-but-undistributed LP fees.
   */
  totalFeesUsd: string | null;
  totalFeesUsdX18: string | null;
  /**
   * Protocol vault / buyback leg (`buyback_raw` / `base_protocol_raw`) distributed to date,
   * marked to USD at latest quote prices. Not executed token buybacks.
   */
  protocolBuybackFeesUsd: string | null;
  protocolBuybackFeesUsdX18: string | null;
  feeSemantics: ProtocolFeeSemantics;
  feeCoverage: ProtocolFeeCoverage;
  updatedAt: string;
};

type FeeAssetAggRow = {
  asset_kind: string;
  asset_address: string;
  fees_raw: string;
  buyback_raw: string;
};

type QuoteMeta = {
  priceUsdX18: string;
  decimals: number;
};

async function loadLatestQuotePrices(
  db: Queryable,
  chainId: number,
  assets: string[],
): Promise<Map<string, QuoteMeta>> {
  const unique = [...new Set(assets.map((a) => a.toLowerCase()))];
  const map = new Map<string, QuoteMeta>();
  if (unique.length === 0) return map;

  const result = await db.query<{
    quote_asset: string;
    price_usd_x18: string;
    decimals: number | null;
  }>(
    `SELECT DISTINCT ON (s.quote_asset)
        s.quote_asset,
        s.price_usd_x18::text AS price_usd_x18,
        q.decimals
     FROM quote_price_snapshots s
     LEFT JOIN quote_assets q
       ON q.chain_id = s.chain_id AND q.quote_asset = s.quote_asset
     WHERE s.chain_id = $1
       AND s.quote_asset = ANY($2::text[])
     ORDER BY s.quote_asset, s.observed_at DESC`,
    [chainId, unique],
  );

  for (const row of result.rows) {
    const decimals =
      row.decimals == null
        ? row.quote_asset === NATIVE_ETH_ADDRESS
          ? 18
          : null
        : Number(row.decimals);
    if (decimals == null || !Number.isFinite(decimals)) continue;
    map.set(row.quote_asset.toLowerCase(), {
      priceUsdX18: String(row.price_usd_x18),
      decimals,
    });
  }

  // Native ETH often stored as zero address — ensure 18 decimals fallback if price exists without catalogue.
  const eth = NATIVE_ETH_ADDRESS.toLowerCase();
  if (!map.has(eth)) {
    const ethOnly = await db.query<{ price_usd_x18: string }>(
      `SELECT price_usd_x18::text AS price_usd_x18
       FROM quote_price_snapshots
       WHERE chain_id = $1 AND quote_asset = $2
       ORDER BY observed_at DESC
       LIMIT 1`,
      [chainId, NATIVE_ETH_ADDRESS],
    );
    const price = ethOnly.rows[0]?.price_usd_x18;
    if (price) {
      map.set(eth, { priceUsdX18: String(price), decimals: 18 });
    }
  }

  return map;
}

function resolveFeeAssetKey(assetKind: string, assetAddress: string): string {
  if (assetKind === 'eth') return NATIVE_ETH_ADDRESS.toLowerCase();
  return assetAddress.toLowerCase();
}

function sumUsdX18FromRaw(
  rows: FeeAssetAggRow[],
  prices: Map<string, QuoteMeta>,
  field: 'fees_raw' | 'buyback_raw',
): { usdX18: bigint; pricedAssets: number; skippedAssets: number } {
  let usdX18 = 0n;
  let pricedAssets = 0;
  let skippedAssets = 0;

  for (const row of rows) {
    const raw = BigInt(row[field] || '0');
    if (raw === 0n) {
      pricedAssets += 1;
      continue;
    }
    const key = resolveFeeAssetKey(row.asset_kind, row.asset_address);
    const meta = prices.get(key);
    if (!meta) {
      skippedAssets += 1;
      continue;
    }
    usdX18 += notionalUsdX18FromQuoteAmount({
      quoteAmountRaw: raw,
      quoteUsdX18: BigInt(meta.priceUsdX18),
      quoteDecimals: meta.decimals,
    });
    pricedAssets += 1;
  }

  return { usdX18, pricedAssets, skippedAssets };
}

/**
 * Canonical public protocol aggregates for `/protocol/tape`.
 * Excludes hidden production canaries (same discovery filter).
 */
export async function getProtocolStats(
  db: Queryable,
  chainId: number,
): Promise<ProtocolStats> {
  const updatedAt = new Date().toISOString();

  const [marketsRes, tradesRes, volumeRes, feesRes] = await Promise.all([
    db.query<{ markets_count: string }>(
      `SELECT COUNT(*)::text AS markets_count
       FROM launches l
       WHERE l.chain_id = $1
       ${HIDDEN_PRODUCTION_CANARY_SQL}`,
      [chainId],
    ),
    db.query<{ trades_count: string }>(
      `SELECT COUNT(*)::text AS trades_count
       FROM trades t
       INNER JOIN launches l
         ON l.chain_id = t.chain_id AND l.token_address = t.token_address
       WHERE t.chain_id = $1
       ${HIDDEN_PRODUCTION_CANARY_SQL}`,
      [chainId],
    ),
    db.query<{ volume_usd_x18: string | null; trades_missing_usd: string }>(
      `SELECT SUM(t.usd_value_x18)::text AS volume_usd_x18,
              COUNT(*) FILTER (WHERE t.usd_value_x18 IS NULL)::text AS trades_missing_usd
       FROM trades t
       INNER JOIN launches l
         ON l.chain_id = t.chain_id AND l.token_address = t.token_address
       WHERE t.chain_id = $1
       ${HIDDEN_PRODUCTION_CANARY_SQL}`,
      [chainId],
    ),
    db.query<FeeAssetAggRow>(
      `SELECT fd.asset_kind,
              lower(fd.asset_address) AS asset_address,
              COALESCE(SUM(fd.total_raw), 0)::text AS fees_raw,
              COALESCE(SUM(fd.buyback_raw), 0)::text AS buyback_raw
       FROM fee_distributions fd
       INNER JOIN launches l
         ON l.chain_id = fd.chain_id AND l.token_address = fd.scooptoken_address
       WHERE fd.chain_id = $1
       ${HIDDEN_PRODUCTION_CANARY_SQL}
       GROUP BY fd.asset_kind, lower(fd.asset_address)`,
      [chainId],
    ),
  ]);

  const marketsLaunched = Number(marketsRes.rows[0]?.markets_count ?? '0');
  const totalTrades = Number(tradesRes.rows[0]?.trades_count ?? '0');
  const volumeUsdX18Raw = volumeRes.rows[0]?.volume_usd_x18 ?? null;
  const tradesMissingUsd = Number(volumeRes.rows[0]?.trades_missing_usd ?? '0');
  const totalVolumeUsdX18 =
    volumeUsdX18Raw == null || volumeUsdX18Raw === '' ? null : String(volumeUsdX18Raw);
  const totalVolumeUsd = formatX18(totalVolumeUsdX18);

  const feeRows = feesRes.rows;
  const assets = feeRows.map((r) => resolveFeeAssetKey(r.asset_kind, r.asset_address));
  const prices = await loadLatestQuotePrices(db, chainId, assets);

  const feesAgg = sumUsdX18FromRaw(feeRows, prices, 'fees_raw');
  const buybackAgg = sumUsdX18FromRaw(feeRows, prices, 'buyback_raw');

  let feeCoverage: ProtocolFeeCoverage;
  if (feeRows.length === 0) {
    feeCoverage = 'empty';
  } else if (feesAgg.skippedAssets === 0) {
    feeCoverage = 'complete';
  } else if (feesAgg.pricedAssets > 0) {
    feeCoverage = 'partial';
  } else {
    feeCoverage = 'unavailable';
  }

  const totalFeesUsdX18 =
    feeCoverage === 'unavailable' ? null : feesAgg.usdX18.toString();
  const protocolBuybackFeesUsdX18 =
    feeCoverage === 'unavailable' ? null : buybackAgg.usdX18.toString();

  return {
    marketsLaunched: Number.isFinite(marketsLaunched) ? marketsLaunched : 0,
    totalTrades: Number.isFinite(totalTrades) ? totalTrades : 0,
    totalVolumeUsd,
    totalVolumeUsdX18,
    tradesMissingUsd: Number.isFinite(tradesMissingUsd) ? tradesMissingUsd : 0,
    totalFeesUsd: formatX18(totalFeesUsdX18),
    totalFeesUsdX18,
    protocolBuybackFeesUsd: formatX18(protocolBuybackFeesUsdX18),
    protocolBuybackFeesUsdX18,
    feeSemantics: 'distributed_marked_to_market',
    feeCoverage,
    updatedAt,
  };
}
