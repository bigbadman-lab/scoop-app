import type { Queryable } from '../types.js';
import type { PublicQuoteCatalogueItem, QuoteCategory } from '../dto.js';

/** Canonical live catalogue size on Robinhood Chain (ETH + USDG + 20 stocks). */
export const CANONICAL_QUOTE_CATALOGUE_COUNT = 22;

/** Production SCOOP chain id. */
export const SCOOP_CHAIN_ID = 4663;

export type GetPublicQuoteCatalogueOptions = {
  chainId?: number;
  /** When true (default), only registered+enabled rows. */
  enabledOnly?: boolean;
};

type PublicQuoteCatalogueSqlRow = {
  chain_id: string | number;
  quote_asset: string;
  quote_type: string;
  symbol: string;
  display_symbol: string;
  name: string;
  decimals: number;
  category: string;
  image_url: string | null;
  source_name: string | null;
  sort_order: number;
  is_registered: boolean;
  is_enabled: boolean;
};

function mapCategory(raw: string): QuoteCategory {
  const c = raw.trim().toLowerCase();
  if (c === 'native' || c === 'stablecoin' || c === 'stock') return c;
  throw new Error(`Unexpected quote category: ${raw}`);
}

function mapRow(row: PublicQuoteCatalogueSqlRow): PublicQuoteCatalogueItem {
  return {
    chainId: Number(row.chain_id),
    quoteAsset: String(row.quote_asset).toLowerCase(),
    quoteType: String(row.quote_type),
    symbol: String(row.symbol).trim(),
    displaySymbol: String(row.display_symbol).trim(),
    name: String(row.name).trim(),
    decimals: Number(row.decimals),
    category: mapCategory(row.category),
    imageUrl: row.image_url == null || row.image_url === '' ? null : String(row.image_url),
    sourceName: row.source_name == null || row.source_name === '' ? null : String(row.source_name),
    sortOrder: Number(row.sort_order),
    isRegistered: Boolean(row.is_registered),
    isEnabled: Boolean(row.is_enabled),
  };
}

/**
 * Product-facing quote catalogue from `public_quote_catalogue`.
 *
 * Future AI/news pairing should consume this catalogue (registered+enabled on
 * chain 4663, ordered by sort_order) rather than a hard-coded ticker list.
 * Do not treat the DB as a substitute for on-chain registration checks.
 */
export async function getPublicQuoteCatalogue(
  db: Queryable,
  options: GetPublicQuoteCatalogueOptions = {},
): Promise<PublicQuoteCatalogueItem[]> {
  const chainId = options.chainId ?? SCOOP_CHAIN_ID;
  const enabledOnly = options.enabledOnly ?? true;

  const result = await db.query<PublicQuoteCatalogueSqlRow>(
    `
    SELECT
      chain_id,
      quote_asset,
      quote_type,
      symbol,
      display_symbol,
      name,
      decimals,
      category,
      image_url,
      source_name,
      sort_order,
      is_registered,
      is_enabled
    FROM public_quote_catalogue
    WHERE chain_id = $1
      AND ($2::boolean = FALSE OR (is_registered = TRUE AND is_enabled = TRUE))
    ORDER BY sort_order ASC
    `,
    [chainId, enabledOnly],
  );

  return result.rows.map(mapRow);
}
