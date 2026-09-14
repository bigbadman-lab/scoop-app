import type { Queryable } from '../types.js';
import { formatRawAmount, formatX18 } from '../decimal.js';
import { normalizeAddress, normalizeBytes32, toNumericString } from '../hex.js';
import type { TradeItem, TradeSide } from '../dto.js';

export type LiveEventKind = 'TokenLaunched' | 'InitialBuyExecuted' | 'Swap';

export type LiveChainEvent = {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  txHash: string;
  logIndex: number;
  eventKind: LiveEventKind;
  tokenAddress: string | null;
  poolId: string | null;
  quoteAsset: string | null;
  side: TradeSide | null;
  quoteAmountRaw: string | null;
  tokenAmountRaw: string | null;
  executionPriceQuoteX18: string | null;
  executionPriceUsdX18: string | null;
  usdValueX18: string | null;
  sqrtPriceX96: string | null;
  payload: Record<string, unknown>;
  observedAt: string;
  expiresAt: string;
};

export type LiveTrade = TradeItem & {
  source: 'live';
  observedAt: string;
  expiresAt: string;
};

export type LiveTokenTip = {
  chainId: number;
  tokenAddress: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  imageUri: string | null;
  displayImageUrl: string | null;
  poolId: string | null;
  quoteAsset: string | null;
  creatorId: string | null;
  deployerAddress: string | null;
  factoryAddress: string | null;
  launchedAt: number | null;
  launchTxHash: string | null;
  priceQuoteX18: string | null;
  priceUsdX18: string | null;
  fdvUsdX18: string | null;
  volume24hQuoteRaw: string | null;
  volume24hUsdX18: string | null;
  tradeCountDelta: number;
  buyCountDelta: number;
  sellCountDelta: number;
  lastSide: TradeSide | null;
  lastTradeAt: number | null;
  sourceBlock: number;
  sourceTxHash: string;
  sourceLogIndex: number;
  updatedAt: string;
  expiresAt: string;
  totalSupplyRaw?: string | null;
  description?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  website?: string;
  farcaster?: string;
};

export type UpsertLiveChainEventInput = {
  chainId: number;
  blockNumber: bigint | number;
  blockHash: string;
  blockTimestamp: bigint | number;
  txHash: string;
  logIndex: number;
  eventKind: LiveEventKind;
  tokenAddress?: string | null;
  poolId?: string | null;
  quoteAsset?: string | null;
  side?: TradeSide | null;
  quoteAmountRaw?: bigint | string | null;
  tokenAmountRaw?: bigint | string | null;
  executionPriceQuoteX18?: bigint | string | null;
  executionPriceUsdX18?: bigint | string | null;
  usdValueX18?: bigint | string | null;
  sqrtPriceX96?: bigint | string | null;
  payload?: Record<string, unknown>;
  ttlSeconds?: number;
};

export type UpsertLiveTokenTipInput = {
  chainId: number;
  tokenAddress: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: number | null;
  imageUri?: string | null;
  displayImageUrl?: string | null;
  poolId?: string | null;
  quoteAsset?: string | null;
  creatorId?: string | null;
  deployerAddress?: string | null;
  factoryAddress?: string | null;
  launchedAt?: bigint | number | null;
  launchTxHash?: string | null;
  priceQuoteX18?: bigint | string | null;
  priceUsdX18?: bigint | string | null;
  fdvUsdX18?: bigint | string | null;
  volume24hQuoteRaw?: bigint | string | null;
  volume24hUsdX18?: bigint | string | null;
  tradeCountDelta?: number;
  buyCountDelta?: number;
  sellCountDelta?: number;
  lastSide?: TradeSide | null;
  lastTradeAt?: bigint | number | null;
  sourceBlock: bigint | number;
  sourceTxHash: string;
  sourceLogIndex: number;
  ttlSeconds?: number;
};

type LiveTipRow = {
  chain_id: string | number;
  token_address: string;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  image_uri: string | null;
  display_image_url: string | null;
  pool_id: string | null;
  quote_asset: string | null;
  creator_id: string | null;
  deployer_address: string | null;
  factory_address: string | null;
  launched_at: string | number | null;
  launch_tx_hash: string | null;
  price_quote_x18: string | null;
  price_usd_x18: string | null;
  fdv_usd_x18: string | null;
  volume_24h_quote_raw: string | null;
  volume_24h_usd_x18: string | null;
  trade_count_delta: number;
  buy_count_delta: number;
  sell_count_delta: number;
  last_side: TradeSide | null;
  last_trade_at: string | number | null;
  source_block: string | number;
  source_tx_hash: string;
  source_log_index: number;
  updated_at: Date | string;
  expires_at: Date | string;
  launch_payload?: Record<string, unknown> | null;
  pending_trade_count?: number | string;
  pending_buy_count?: number | string;
  pending_sell_count?: number | string;
  pending_volume_quote_raw?: string | null;
  pending_volume_usd_x18?: string | null;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableNumeric(value: bigint | string | null | undefined): string | null {
  return value == null ? null : toNumericString(value);
}

function mapLiveTip(row: LiveTipRow): LiveTokenTip {
  const payload = row.launch_payload ?? {};
  return {
    chainId: Number(row.chain_id),
    tokenAddress: normalizeAddress(row.token_address),
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals == null ? null : Number(row.decimals),
    imageUri: row.image_uri,
    displayImageUrl: row.display_image_url,
    poolId: row.pool_id ? normalizeBytes32(row.pool_id) : null,
    quoteAsset: row.quote_asset ? normalizeAddress(row.quote_asset) : null,
    creatorId: row.creator_id ? normalizeBytes32(row.creator_id) : null,
    deployerAddress: row.deployer_address ? normalizeAddress(row.deployer_address) : null,
    factoryAddress: row.factory_address ? normalizeAddress(row.factory_address) : null,
    launchedAt: row.launched_at == null ? null : Number(row.launched_at),
    launchTxHash: row.launch_tx_hash ? normalizeBytes32(row.launch_tx_hash) : null,
    priceQuoteX18: row.price_quote_x18,
    priceUsdX18: row.price_usd_x18,
    fdvUsdX18: row.fdv_usd_x18,
    // Pending aggregates only — never fall back to tip-stored deltas (those can
    // linger after confirmed live_chain_events are deleted and would double-count).
    volume24hQuoteRaw: row.pending_volume_quote_raw ?? null,
    volume24hUsdX18: row.pending_volume_usd_x18 ?? null,
    tradeCountDelta: Number(row.pending_trade_count ?? 0),
    buyCountDelta: Number(row.pending_buy_count ?? 0),
    sellCountDelta: Number(row.pending_sell_count ?? 0),
    lastSide: row.last_side,
    lastTradeAt: row.last_trade_at == null ? null : Number(row.last_trade_at),
    sourceBlock: Number(row.source_block),
    sourceTxHash: normalizeBytes32(row.source_tx_hash),
    sourceLogIndex: Number(row.source_log_index),
    updatedAt: iso(row.updated_at),
    expiresAt: iso(row.expires_at),
    totalSupplyRaw:
      payload.totalSupplyRaw == null ? null : String(payload.totalSupplyRaw),
    description: String(payload.description ?? ''),
    twitter: String(payload.twitter ?? ''),
    telegram: String(payload.telegram ?? ''),
    discord: String(payload.discord ?? ''),
    website: String(payload.website ?? ''),
    farcaster: String(payload.farcaster ?? ''),
  };
}

export function buildPublicTokenImageUrl(
  displayImagePath: string | null | undefined,
  supabaseUrl: string | null | undefined = process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  const path = displayImagePath?.trim().replace(/^\/+/, '');
  const origin = supabaseUrl?.trim().replace(/\/+$/, '');
  if (!path || !origin) return null;
  try {
    const url = new URL(origin);
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return `${url.origin}/storage/v1/object/public/token-image/${encodedPath}`;
  } catch {
    return null;
  }
}

export async function lookupLiveDisplayImageUrl(
  db: Queryable,
  imageUri: string,
  supabaseUrl?: string | null,
): Promise<string | null> {
  const result = await db.query<{ display_image_path: string | null }>(
    `SELECT display_image_path
       FROM token_display_finalize_intents
      WHERE image_uri = $1
        AND status IN ('awaiting_token', 'pending')
        AND display_image_path IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 1`,
    [imageUri.trim()],
  );
  return buildPublicTokenImageUrl(result.rows[0]?.display_image_path, supabaseUrl);
}

/** Returns true only when this chain log was newly inserted. */
export async function upsertLiveChainEvent(
  db: Queryable,
  input: UpsertLiveChainEventInput,
): Promise<boolean> {
  const result = await db.query<{ inserted: boolean }>(
    `INSERT INTO live_chain_events (
       chain_id, block_number, block_hash, block_timestamp, tx_hash, log_index,
       event_kind, token_address, pool_id, quote_asset, side, quote_amount_raw,
       token_amount_raw, execution_price_quote_x18, execution_price_usd_x18,
       usd_value_x18, sqrt_price_x96, payload, expires_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
       NOW() + ($19::text || ' seconds')::interval
     )
     ON CONFLICT (chain_id, tx_hash, log_index) DO UPDATE SET
       observed_at = NOW(),
       expires_at = EXCLUDED.expires_at,
       payload = EXCLUDED.payload
     RETURNING (xmax = 0) AS inserted`,
    [
      input.chainId,
      toNumericString(input.blockNumber),
      normalizeBytes32(input.blockHash),
      toNumericString(input.blockTimestamp),
      normalizeBytes32(input.txHash),
      input.logIndex,
      input.eventKind,
      input.tokenAddress ? normalizeAddress(input.tokenAddress) : null,
      input.poolId ? normalizeBytes32(input.poolId) : null,
      input.quoteAsset ? normalizeAddress(input.quoteAsset) : null,
      input.side ?? null,
      nullableNumeric(input.quoteAmountRaw),
      nullableNumeric(input.tokenAmountRaw),
      nullableNumeric(input.executionPriceQuoteX18),
      nullableNumeric(input.executionPriceUsdX18),
      nullableNumeric(input.usdValueX18),
      nullableNumeric(input.sqrtPriceX96),
      input.payload ?? {},
      input.ttlSeconds ?? 900,
    ],
  );
  return Boolean(result.rows[0]?.inserted);
}

export async function upsertLiveTokenTip(
  db: Queryable,
  input: UpsertLiveTokenTipInput,
): Promise<void> {
  await db.query(
    `INSERT INTO live_token_tips (
       chain_id, token_address, name, symbol, decimals, image_uri,
       display_image_url, pool_id, quote_asset, creator_id, deployer_address,
       factory_address, launched_at, launch_tx_hash, price_quote_x18,
       price_usd_x18, fdv_usd_x18, volume_24h_quote_raw, volume_24h_usd_x18,
       trade_count_delta, buy_count_delta, sell_count_delta, last_side,
       last_trade_at, source_block, source_tx_hash, source_log_index, expires_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
       $20,$21,$22,$23,$24,$25,$26,$27,NOW() + ($28::text || ' seconds')::interval
     )
     ON CONFLICT (chain_id, token_address) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, live_token_tips.name),
       symbol = COALESCE(EXCLUDED.symbol, live_token_tips.symbol),
       decimals = COALESCE(EXCLUDED.decimals, live_token_tips.decimals),
       image_uri = COALESCE(EXCLUDED.image_uri, live_token_tips.image_uri),
       display_image_url = COALESCE(EXCLUDED.display_image_url, live_token_tips.display_image_url),
       pool_id = COALESCE(EXCLUDED.pool_id, live_token_tips.pool_id),
       quote_asset = COALESCE(EXCLUDED.quote_asset, live_token_tips.quote_asset),
       creator_id = COALESCE(EXCLUDED.creator_id, live_token_tips.creator_id),
       deployer_address = COALESCE(EXCLUDED.deployer_address, live_token_tips.deployer_address),
       factory_address = COALESCE(EXCLUDED.factory_address, live_token_tips.factory_address),
       launched_at = COALESCE(EXCLUDED.launched_at, live_token_tips.launched_at),
       launch_tx_hash = COALESCE(EXCLUDED.launch_tx_hash, live_token_tips.launch_tx_hash),
       price_quote_x18 = COALESCE(EXCLUDED.price_quote_x18, live_token_tips.price_quote_x18),
       price_usd_x18 = COALESCE(EXCLUDED.price_usd_x18, live_token_tips.price_usd_x18),
       fdv_usd_x18 = COALESCE(EXCLUDED.fdv_usd_x18, live_token_tips.fdv_usd_x18),
       volume_24h_quote_raw = COALESCE(live_token_tips.volume_24h_quote_raw, 0) +
         COALESCE(EXCLUDED.volume_24h_quote_raw, 0),
       volume_24h_usd_x18 = CASE
         WHEN EXCLUDED.volume_24h_usd_x18 IS NULL THEN live_token_tips.volume_24h_usd_x18
         ELSE COALESCE(live_token_tips.volume_24h_usd_x18, 0) + EXCLUDED.volume_24h_usd_x18
       END,
       trade_count_delta = live_token_tips.trade_count_delta + EXCLUDED.trade_count_delta,
       buy_count_delta = live_token_tips.buy_count_delta + EXCLUDED.buy_count_delta,
       sell_count_delta = live_token_tips.sell_count_delta + EXCLUDED.sell_count_delta,
       last_side = COALESCE(EXCLUDED.last_side, live_token_tips.last_side),
       last_trade_at = COALESCE(EXCLUDED.last_trade_at, live_token_tips.last_trade_at),
       source_block = EXCLUDED.source_block,
       source_tx_hash = EXCLUDED.source_tx_hash,
       source_log_index = EXCLUDED.source_log_index,
       updated_at = NOW(),
       expires_at = EXCLUDED.expires_at`,
    [
      input.chainId,
      normalizeAddress(input.tokenAddress),
      input.name ?? null,
      input.symbol ?? null,
      input.decimals ?? null,
      input.imageUri ?? null,
      input.displayImageUrl ?? null,
      input.poolId ? normalizeBytes32(input.poolId) : null,
      input.quoteAsset ? normalizeAddress(input.quoteAsset) : null,
      input.creatorId ? normalizeBytes32(input.creatorId) : null,
      input.deployerAddress ? normalizeAddress(input.deployerAddress) : null,
      input.factoryAddress ? normalizeAddress(input.factoryAddress) : null,
      input.launchedAt == null ? null : toNumericString(input.launchedAt),
      input.launchTxHash ? normalizeBytes32(input.launchTxHash) : null,
      nullableNumeric(input.priceQuoteX18),
      nullableNumeric(input.priceUsdX18),
      nullableNumeric(input.fdvUsdX18),
      nullableNumeric(input.volume24hQuoteRaw),
      nullableNumeric(input.volume24hUsdX18),
      input.tradeCountDelta ?? 0,
      input.buyCountDelta ?? 0,
      input.sellCountDelta ?? 0,
      input.lastSide ?? null,
      input.lastTradeAt == null ? null : toNumericString(input.lastTradeAt),
      toNumericString(input.sourceBlock),
      normalizeBytes32(input.sourceTxHash),
      input.sourceLogIndex,
      input.ttlSeconds ?? 900,
    ],
  );
}

export async function listLiveTips(
  db: Queryable,
  chainId: number,
): Promise<LiveTokenTip[]> {
  const result = await db.query<LiveTipRow>(
    `SELECT t.*, e.payload AS launch_payload,
            COALESCE(s.trade_count, 0) AS pending_trade_count,
            COALESCE(s.buy_count, 0) AS pending_buy_count,
            COALESCE(s.sell_count, 0) AS pending_sell_count,
            s.volume_quote_raw::text AS pending_volume_quote_raw,
            s.volume_usd_x18::text AS pending_volume_usd_x18
       FROM live_token_tips t
       LEFT JOIN indexer_checkpoints cp
         ON cp.chain_id = t.chain_id AND cp.stream_name = 'main'
       LEFT JOIN LATERAL (
         SELECT payload
           FROM live_chain_events
          WHERE chain_id = t.chain_id
            AND token_address = t.token_address
            AND event_kind = 'TokenLaunched'
            AND expires_at > NOW()
          ORDER BY block_number DESC, log_index DESC
          LIMIT 1
       ) e ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS trade_count,
                COUNT(*) FILTER (WHERE side = 'buy')::int AS buy_count,
                COUNT(*) FILTER (WHERE side = 'sell')::int AS sell_count,
                SUM(quote_amount_raw) AS volume_quote_raw,
                SUM(usd_value_x18) AS volume_usd_x18
           FROM live_chain_events
          WHERE chain_id = t.chain_id AND token_address = t.token_address
            AND event_kind IN ('Swap', 'InitialBuyExecuted')
            AND expires_at > NOW()
            AND block_number > COALESCE(cp.last_block_number, -1)
       ) s ON TRUE
      WHERE t.chain_id = $1 AND t.expires_at > NOW()
        AND t.source_block > COALESCE(cp.last_block_number, -1)
      ORDER BY t.launched_at DESC NULLS LAST`,
    [chainId],
  );
  return result.rows.map(mapLiveTip);
}

export async function getLiveTokenTip(
  db: Queryable,
  chainId: number,
  tokenAddress: string,
): Promise<LiveTokenTip | null> {
  const tips = await db.query<LiveTipRow>(
    `SELECT t.*, e.payload AS launch_payload,
            COALESCE(s.trade_count, 0) AS pending_trade_count,
            COALESCE(s.buy_count, 0) AS pending_buy_count,
            COALESCE(s.sell_count, 0) AS pending_sell_count,
            s.volume_quote_raw::text AS pending_volume_quote_raw,
            s.volume_usd_x18::text AS pending_volume_usd_x18
       FROM live_token_tips t
       LEFT JOIN indexer_checkpoints cp
         ON cp.chain_id = t.chain_id AND cp.stream_name = 'main'
       LEFT JOIN LATERAL (
         SELECT payload
           FROM live_chain_events
          WHERE chain_id = t.chain_id AND token_address = t.token_address
            AND event_kind = 'TokenLaunched' AND expires_at > NOW()
          ORDER BY block_number DESC, log_index DESC LIMIT 1
       ) e ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS trade_count,
                COUNT(*) FILTER (WHERE side = 'buy')::int AS buy_count,
                COUNT(*) FILTER (WHERE side = 'sell')::int AS sell_count,
                SUM(quote_amount_raw) AS volume_quote_raw,
                SUM(usd_value_x18) AS volume_usd_x18
           FROM live_chain_events
          WHERE chain_id = t.chain_id AND token_address = t.token_address
            AND event_kind IN ('Swap', 'InitialBuyExecuted')
            AND expires_at > NOW()
            AND block_number > COALESCE(cp.last_block_number, -1)
       ) s ON TRUE
      WHERE t.chain_id = $1 AND t.token_address = $2 AND t.expires_at > NOW()
        AND t.source_block > COALESCE(cp.last_block_number, -1)
      LIMIT 1`,
    [chainId, normalizeAddress(tokenAddress)],
  );
  return tips.rows[0] ? mapLiveTip(tips.rows[0]) : null;
}

export async function listLiveEventsByToken(
  db: Queryable,
  chainId: number,
  tokenAddress: string,
): Promise<LiveChainEvent[]> {
  const result = await db.query(
    `SELECT * FROM live_chain_events
      WHERE chain_id = $1 AND token_address = $2 AND expires_at > NOW()
      ORDER BY block_timestamp DESC, log_index DESC`,
    [chainId, normalizeAddress(tokenAddress)],
  );
  return result.rows.map((row) => ({
    chainId: Number(row.chain_id),
    blockNumber: Number(row.block_number),
    blockHash: String(row.block_hash),
    blockTimestamp: Number(row.block_timestamp),
    txHash: String(row.tx_hash),
    logIndex: Number(row.log_index),
    eventKind: row.event_kind as LiveEventKind,
    tokenAddress: row.token_address == null ? null : String(row.token_address),
    poolId: row.pool_id == null ? null : String(row.pool_id),
    quoteAsset: row.quote_asset == null ? null : String(row.quote_asset),
    side: row.side as TradeSide | null,
    quoteAmountRaw: row.quote_amount_raw == null ? null : String(row.quote_amount_raw),
    tokenAmountRaw: row.token_amount_raw == null ? null : String(row.token_amount_raw),
    executionPriceQuoteX18:
      row.execution_price_quote_x18 == null ? null : String(row.execution_price_quote_x18),
    executionPriceUsdX18:
      row.execution_price_usd_x18 == null ? null : String(row.execution_price_usd_x18),
    usdValueX18: row.usd_value_x18 == null ? null : String(row.usd_value_x18),
    sqrtPriceX96: row.sqrt_price_x96 == null ? null : String(row.sqrt_price_x96),
    payload: (row.payload ?? {}) as Record<string, unknown>,
    observedAt: iso(row.observed_at as Date | string),
    expiresAt: iso(row.expires_at as Date | string),
  }));
}

export async function listLiveTradesByToken(
  db: Queryable,
  chainId: number,
  tokenAddress: string,
): Promise<LiveTrade[]> {
  const result = await db.query(
    `SELECT e.*, COALESCE(t.decimals, 18) AS token_decimals,
            COALESCE(q.decimals, 18) AS quote_decimals
       FROM live_chain_events e
       LEFT JOIN live_token_tips t
         ON t.chain_id = e.chain_id AND t.token_address = e.token_address
       LEFT JOIN quote_assets q
         ON q.chain_id = e.chain_id AND q.quote_asset = e.quote_asset
      WHERE e.chain_id = $1 AND e.token_address = $2
        AND e.event_kind IN ('Swap', 'InitialBuyExecuted')
        AND e.expires_at > NOW()
      ORDER BY e.block_timestamp DESC, e.log_index DESC`,
    [chainId, normalizeAddress(tokenAddress)],
  );
  return result.rows.map((row) => {
    const quoteRaw = String(row.quote_amount_raw ?? '0');
    const tokenRaw = String(row.token_amount_raw ?? '0');
    const price = String(row.execution_price_quote_x18 ?? '0');
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const quoteUsd = payload.quoteUsdX18 == null ? null : String(payload.quoteUsdX18);
    const priceUsd =
      row.execution_price_usd_x18 == null ? null : String(row.execution_price_usd_x18);
    const usdValue = row.usd_value_x18 == null ? null : String(row.usd_value_x18);
    return {
      chainId: Number(row.chain_id),
      txHash: String(row.tx_hash),
      logIndex: Number(row.log_index),
      blockNumber: Number(row.block_number),
      blockTimestamp: Number(row.block_timestamp),
      tokenAddress: String(row.token_address),
      poolId: String(row.pool_id),
      side: String(row.side),
      swapSender: String(payload.sender ?? ''),
      txFrom: payload.txFrom == null ? null : String(payload.txFrom),
      traderAddress: payload.txFrom == null ? null : String(payload.txFrom),
      traderAttributionType: payload.txFrom == null ? 'unknown' : 'tx_from',
      quoteAmountRaw: quoteRaw,
      quoteAmountDisplay: formatRawAmount(quoteRaw, Number(row.quote_decimals)),
      tokenAmountRaw: tokenRaw,
      tokenAmountDisplay: formatRawAmount(tokenRaw, Number(row.token_decimals)),
      executionPriceQuoteX18: price,
      executionPriceQuoteDisplay: formatX18(price) ?? '0',
      quoteUsdX18: quoteUsd,
      executionPriceUsdX18: priceUsd,
      executionPriceUsdDisplay: formatX18(priceUsd),
      usdValueX18: usdValue,
      usdValueDisplay: formatX18(usdValue),
      isInitialBuy: row.event_kind === 'InitialBuyExecuted',
      confirmationStatus: 'pending',
      source: 'live',
      observedAt: iso(row.observed_at as Date | string),
      expiresAt: iso(row.expires_at as Date | string),
    } satisfies LiveTrade;
  });
}

export async function expireLiveOverlayRows(
  db: Queryable,
  chainId?: number,
): Promise<{ events: number; tips: number }> {
  const params = chainId == null ? [] : [chainId];
  const clause = chainId == null ? '' : ' AND chain_id = $1';
  const [events, tips] = await Promise.all([
    db.query(`DELETE FROM live_chain_events WHERE expires_at <= NOW()${clause}`, params),
    db.query(`DELETE FROM live_token_tips WHERE expires_at <= NOW()${clause}`, params),
  ]);
  return { events: events.rowCount ?? 0, tips: tips.rowCount ?? 0 };
}

export async function getLiveObserverCheckpoint(
  db: Queryable,
  chainId: number,
): Promise<number | null> {
  const result = await db.query<{ last_block_number: string | number }>(
    `SELECT last_block_number FROM live_observer_checkpoints WHERE chain_id = $1`,
    [chainId],
  );
  return result.rows[0] ? Number(result.rows[0].last_block_number) : null;
}

export async function setLiveObserverCheckpoint(
  db: Queryable,
  chainId: number,
  blockNumber: bigint | number,
): Promise<void> {
  await db.query(
    `INSERT INTO live_observer_checkpoints (chain_id, last_block_number)
     VALUES ($1, $2)
     ON CONFLICT (chain_id) DO UPDATE SET
       last_block_number = EXCLUDED.last_block_number,
       updated_at = NOW()`,
    [chainId, toNumericString(blockNumber)],
  );
}

export async function deleteLiveRowsMatchingConfirmed(
  db: Queryable,
  chainId: number,
  txHash: string,
  logIndex: number,
): Promise<number> {
  const hash = normalizeBytes32(txHash);
  const tips = await db.query(
    `DELETE FROM live_token_tips
      WHERE chain_id = $1 AND source_tx_hash = $2 AND source_log_index = $3`,
    [chainId, hash, logIndex],
  );
  const events = await db.query(
    `DELETE FROM live_chain_events
      WHERE chain_id = $1 AND tx_hash = $2 AND log_index = $3`,
    [chainId, hash, logIndex],
  );
  return (tips.rowCount ?? 0) + (events.rowCount ?? 0);
}

export async function deleteConfirmedLiveRows(
  db: Queryable,
  chainId: number,
): Promise<number> {
  const result = await db.query(
    `DELETE FROM live_chain_events live
      WHERE live.chain_id = $1
        AND EXISTS (
          SELECT 1 FROM raw_chain_events canonical
           WHERE canonical.chain_id = live.chain_id
             AND canonical.tx_hash = live.tx_hash
             AND canonical.log_index = live.log_index
             AND canonical.is_canonical = TRUE
        )`,
    [chainId],
  );
  return result.rowCount ?? 0;
}
