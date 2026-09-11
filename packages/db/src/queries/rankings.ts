import type { Queryable } from '../types.js';
import { clampLimit } from '../decimal.js';
import type { DiscoveryRankingItem, RankingType } from '../dto.js';
import {
  DEFAULT_NEW_WINDOW_SECONDS,
  DEFAULT_SOON_THRESHOLD_BPS,
  DISCOVERY_SELECT,
  mapDiscoveryItem,
  type DiscoverySqlRow,
} from './_discoverySql.js';

export interface GetRankingsOptions {
  limit?: number;
  newWindowSeconds?: number;
  soonThresholdBps?: number;
}

function rankingOrder(type: RankingType): { where: string; order: string; metric: string } {
  switch (type) {
    case 'volume24h':
      return {
        where: '',
        order: 'ORDER BY COALESCE(m.volume_24h_quote_raw, 0) DESC, l.launched_at DESC',
        metric: 'm.volume_24h_quote_raw::text',
      };
    case 'fdv':
      return {
        where: '',
        order: 'ORDER BY COALESCE(m.fdv_usd_x18, 0) DESC NULLS LAST, l.launched_at DESC',
        metric: 'm.fdv_usd_x18::text',
      };
    case 'gainers':
      return {
        where: 'AND m.price_change_24h_bps IS NOT NULL',
        order: 'ORDER BY m.price_change_24h_bps DESC, l.launched_at DESC',
        metric: 'm.price_change_24h_bps::text',
      };
    case 'losers':
      return {
        where: 'AND m.price_change_24h_bps IS NOT NULL',
        order: 'ORDER BY m.price_change_24h_bps ASC, l.launched_at DESC',
        metric: 'm.price_change_24h_bps::text',
      };
    case 'mostTraded':
      return {
        where: '',
        order: 'ORDER BY COALESCE(m.trade_count_24h, 0) DESC, l.launched_at DESC',
        metric: 'm.trade_count_24h::text',
      };
    case 'mostHolders':
      return {
        where: '',
        order: 'ORDER BY COALESCE(m.holder_count_retail, 0) DESC, l.launched_at DESC',
        metric: 'm.holder_count_retail::text',
      };
    case 'newest':
      return {
        where: 'AND l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2::INT)',
        order: 'ORDER BY l.launched_at DESC, l.token_address ASC',
        metric: 'l.launched_at::text',
      };
    case 'soon':
      return {
        where: `AND COALESCE(m.launch_progress_bps, 0) >= $3::INT
                AND COALESCE(m.launch_complete, FALSE) = FALSE`,
        order: 'ORDER BY COALESCE(m.launch_progress_bps, 0) DESC, l.launched_at DESC, l.token_address ASC',
        metric: 'm.launch_progress_bps::text',
      };
    case 'bonded':
      return {
        where: 'AND COALESCE(m.launch_complete, FALSE) = TRUE',
        order: 'ORDER BY l.launched_at DESC, l.token_address ASC',
        metric: 'l.launched_at::text',
      };
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown ranking type: ${_exhaustive}`);
    }
  }
}

const RANKING_TYPES = new Set<RankingType>([
  'volume24h',
  'fdv',
  'gainers',
  'losers',
  'mostTraded',
  'mostHolders',
  'newest',
  'soon',
  'bonded',
]);

export function assertRankingType(type: string): RankingType {
  if (!RANKING_TYPES.has(type as RankingType)) {
    throw new Error(`Invalid ranking type: ${type}`);
  }
  return type as RankingType;
}

export async function getRankings(
  db: Queryable,
  chainId: number,
  typeInput: string,
  options: GetRankingsOptions = {},
): Promise<DiscoveryRankingItem[]> {
  const type = assertRankingType(typeInput);
  const limit = clampLimit(options.limit);
  const newWindow = options.newWindowSeconds ?? DEFAULT_NEW_WINDOW_SECONDS;
  const soonBps = options.soonThresholdBps ?? DEFAULT_SOON_THRESHOLD_BPS;
  const { where, order, metric } = rankingOrder(type);

  const result = await db.query(
    `
    SELECT sub.*, sub.metric_raw
    FROM (
      ${DISCOVERY_SELECT.replace(
        'SELECT',
        `SELECT ${metric} AS metric_raw,`,
      )}
      WHERE l.chain_id = $1
      ${where}
      ${order}
      LIMIT $4
    ) sub
    `,
    [chainId, newWindow, soonBps, limit],
  );

  // DISCOVERY_SELECT already starts with SELECT — the replace above can be fragile.
  // Prefer an explicit query:
  void result;

  const explicit = await db.query(
    `
    SELECT
      l.chain_id,
      l.token_address,
      t.name,
      t.symbol,
      t.decimals,
      t.image_uri,
      t.display_image_url,
      l.pool_id,
      l.creator_id,
      l.quote_asset,
      l.launched_at,
      (EXTRACT(EPOCH FROM NOW())::BIGINT - l.launched_at) AS age_seconds,
      COALESCE(m.launch_progress_bps, 0) AS launch_progress_bps,
      COALESCE(m.launch_complete, FALSE) AS launch_complete,
      (l.launched_at >= (EXTRACT(EPOCH FROM NOW())::BIGINT - $2::INT)) AS is_new,
      (
        COALESCE(m.launch_progress_bps, 0) >= $3::INT
        AND COALESCE(m.launch_complete, FALSE) = FALSE
      ) AS is_soon,
      (COALESCE(m.launch_complete, FALSE) = TRUE) AS is_bonded,
      m.price_quote_x18::text AS price_quote_x18,
      m.fdv_usd_x18::text AS fdv_usd_x18,
      m.volume_24h_quote_raw::text AS volume_24h_quote_raw,
      m.volume_24h_usd_x18::text AS volume_24h_usd_x18,
      m.trade_count_24h,
      m.holder_count_all,
      m.holder_count_retail,
      m.last_trade_at,
      m.price_change_24h_bps,
      (${metric}) AS metric_raw
    FROM launches l
    INNER JOIN tokens t
      ON t.chain_id = l.chain_id AND t.token_address = l.token_address
    LEFT JOIN token_market_state m
      ON m.chain_id = l.chain_id AND m.token_address = l.token_address
    WHERE l.chain_id = $1
    ${where}
    ${order}
    LIMIT $4
    `,
    [chainId, newWindow, soonBps, limit],
  );

  return explicit.rows.map((row, index) => {
    const token = mapDiscoveryItem(row as DiscoverySqlRow);
    const metricRaw = row.metric_raw == null ? null : String(row.metric_raw);
    let metricDisplay: string | null = metricRaw;
    if (type === 'volume24h' && metricRaw != null) {
      metricDisplay = token.volume24hQuoteDisplay;
    } else if (type === 'fdv' && metricRaw != null) {
      metricDisplay = token.fdvUsdDisplay;
    } else if ((type === 'gainers' || type === 'losers') && metricRaw != null) {
      metricDisplay = `${Number(metricRaw) / 100}%`;
    }

    return {
      rank: index + 1,
      type,
      token,
      metricRaw,
      metricDisplay,
    } satisfies DiscoveryRankingItem;
  });
}
