import type { Queryable } from '@scoop/db';
import type { EnabledQuoteAsset, QuoteType } from '../ai/types.js';

const KNOWN_TYPES = new Set<QuoteType>(['native', 'stablecoin', 'stock_token', 'erc20']);

function mapQuoteType(raw: string): QuoteType {
  const t = raw.trim().toLowerCase();
  if (KNOWN_TYPES.has(t as QuoteType)) return t as QuoteType;
  if (t === 'eth' || t === 'native_eth') return 'native';
  if (t.includes('stable')) return 'stablecoin';
  if (t.includes('stock')) return 'stock_token';
  return 'erc20';
}

/**
 * Canonical launch-eligible quotes from `quote_assets`
 * where is_registered AND is_enabled.
 */
export async function getEnabledQuoteAssets(
  db: Queryable,
  options: { chainId?: number } = {},
): Promise<EnabledQuoteAsset[]> {
  const chainId = options.chainId ?? Number(process.env.SCOOP_CHAIN_ID ?? 4663);
  const result = await db.query<{
    chain_id: string | number;
    quote_asset: string;
    quote_type: string;
    symbol: string;
    decimals: number;
  }>(
    `SELECT chain_id, quote_asset, quote_type, symbol, decimals
     FROM quote_assets
     WHERE chain_id = $1
       AND is_registered = TRUE
       AND is_enabled = TRUE
     ORDER BY symbol ASC`,
    [chainId],
  );

  return result.rows.map((row) => ({
    chainId: Number(row.chain_id),
    address: String(row.quote_asset).toLowerCase(),
    symbol: String(row.symbol).trim(),
    quoteType: mapQuoteType(row.quote_type),
    decimals: Number(row.decimals),
  }));
}
