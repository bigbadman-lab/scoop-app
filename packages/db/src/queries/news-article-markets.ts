import type { Queryable } from '../types.js';
import { formatX18 } from '../decimal.js';
import { normalizeAddress } from '../hex.js';

export type NewsArticleMarketSummary = {
  chainId: number;
  tokenAddress: string;
  symbol: string;
  name: string;
  quoteAsset: string;
  launchedAt: number;
  ageSeconds: number;
  priceUsdX18: string | null;
  priceUsdDisplay: string | null;
  fdvUsdX18: string | null;
  fdvUsdDisplay: string | null;
  volume24hUsdX18: string | null;
  volume24hUsdDisplay: string | null;
};

export type NewsArticleMarketBundle = {
  providerArticleId: string;
  marketCount: number;
  /** Newest-first; feed embeds at most a few for one-market badge. */
  markets: NewsArticleMarketSummary[];
};

type SqlRow = {
  provider_article_id: string;
  chain_id: string | number;
  token_address: string;
  symbol: string;
  name: string;
  quote_asset: string;
  launched_at: string | number;
  age_seconds: string | number;
  price_usd_x18: string | null;
  fdv_usd_x18: string | null;
  volume_24h_usd_x18: string | null;
};

function mapRow(row: SqlRow): NewsArticleMarketSummary {
  const priceUsdX18 = row.price_usd_x18;
  const fdvUsdX18 = row.fdv_usd_x18;
  const volume24hUsdX18 = row.volume_24h_usd_x18;
  return {
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    symbol: row.symbol,
    name: row.name,
    quoteAsset: normalizeAddress(row.quote_asset),
    launchedAt: Number(row.launched_at),
    ageSeconds: Number(row.age_seconds),
    priceUsdX18,
    priceUsdDisplay: formatX18(priceUsdX18),
    fdvUsdX18,
    fdvUsdDisplay: formatX18(fdvUsdX18),
    volume24hUsdX18,
    volume24hUsdDisplay: formatX18(volume24hUsdX18),
  };
}

/**
 * Batch-load markets for many articles (one query — no N+1).
 * Newest-launched first within each article.
 */
export async function getNewsArticleMarketsForArticles(
  db: Queryable,
  args: {
    provider: string;
    providerArticleIds: readonly string[];
    /** Max markets kept per article in the result map (feed uses small N). */
    perArticleLimit?: number;
  },
): Promise<Map<string, NewsArticleMarketBundle>> {
  const ids = [...new Set(args.providerArticleIds.map((id) => id.trim()).filter(Boolean))];
  const out = new Map<string, NewsArticleMarketBundle>();
  for (const id of ids) {
    out.set(id, { providerArticleId: id, marketCount: 0, markets: [] });
  }
  if (ids.length === 0) return out;

  const perArticleLimit = Math.max(1, Math.min(args.perArticleLimit ?? 3, 50));

  const result = await db.query<SqlRow>(
    `
    WITH ranked AS (
      SELECT
        nam.provider_article_id,
        nam.chain_id,
        nam.token_address,
        t.symbol,
        t.name,
        l.quote_asset,
        l.launched_at,
        (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
        m.price_usd_x18::text AS price_usd_x18,
        m.fdv_usd_x18::text AS fdv_usd_x18,
        m.volume_24h_usd_x18::text AS volume_24h_usd_x18,
        COUNT(*) OVER (PARTITION BY nam.provider_article_id) AS market_count,
        ROW_NUMBER() OVER (
          PARTITION BY nam.provider_article_id
          ORDER BY l.launched_at DESC, nam.token_address ASC
        ) AS rn
      FROM news_article_markets nam
      INNER JOIN launches l
        ON l.chain_id = nam.chain_id AND l.token_address = nam.token_address
      INNER JOIN tokens t
        ON t.chain_id = nam.chain_id AND t.token_address = nam.token_address
      LEFT JOIN token_market_state m
        ON m.chain_id = nam.chain_id AND m.token_address = nam.token_address
      WHERE nam.provider = $1
        AND nam.provider_article_id = ANY($2::text[])
    )
    SELECT
      provider_article_id, chain_id, token_address, symbol, name, quote_asset,
      launched_at, age_seconds, price_usd_x18, fdv_usd_x18, volume_24h_usd_x18,
      market_count
    FROM ranked
    WHERE rn <= $3
    ORDER BY provider_article_id ASC, launched_at DESC, token_address ASC
    `,
    [args.provider, ids, perArticleLimit],
  );

  for (const row of result.rows) {
    const id = row.provider_article_id;
    const bundle = out.get(id) ?? {
      providerArticleId: id,
      marketCount: 0,
      markets: [],
    };
    // market_count is repeated on each ranked row
    const count = Number(
      (row as SqlRow & { market_count?: string | number }).market_count ?? bundle.marketCount,
    );
    bundle.marketCount = count;
    bundle.markets.push(mapRow(row));
    out.set(id, bundle);
  }

  return out;
}

/** Full newest-first list for one article (selector). */
export async function listNewsArticleMarkets(
  db: Queryable,
  args: {
    provider: string;
    providerArticleId: string;
    limit?: number;
  },
): Promise<NewsArticleMarketSummary[]> {
  const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
  const result = await db.query<SqlRow>(
    `
    SELECT
      nam.provider_article_id,
      nam.chain_id,
      nam.token_address,
      t.symbol,
      t.name,
      l.quote_asset,
      l.launched_at,
      (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
      m.price_usd_x18::text AS price_usd_x18,
      m.fdv_usd_x18::text AS fdv_usd_x18,
      m.volume_24h_usd_x18::text AS volume_24h_usd_x18
    FROM news_article_markets nam
    INNER JOIN launches l
      ON l.chain_id = nam.chain_id AND l.token_address = nam.token_address
    INNER JOIN tokens t
      ON t.chain_id = nam.chain_id AND t.token_address = nam.token_address
    LEFT JOIN token_market_state m
      ON m.chain_id = nam.chain_id AND m.token_address = nam.token_address
    WHERE nam.provider = $1 AND nam.provider_article_id = $2
    ORDER BY l.launched_at DESC, nam.token_address ASC
    LIMIT $3
    `,
    [args.provider, args.providerArticleId.trim(), limit],
  );
  return result.rows.map(mapRow);
}
