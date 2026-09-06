import { createPool, query, type Queryable } from '@scoop/db';
import { DEAD_ADDRESS, ZERO_ADDRESS } from '@scoop/shared';
import { loadConfig } from '../config.js';
import { HELLO } from './fixture.js';

export type HelloAssertionKind = 'immutable' | 'mutable';

export interface HelloCheck {
  name: string;
  pass: boolean;
  detail?: string;
  kind: HelloAssertionKind;
}

/** Launch-minute bucket for HELLO (UTC floor to 60s). */
export const HELLO_LAUNCH_1M_BUCKET =
  Math.floor(HELLO.blockTimestamp / 60) * 60;

/**
 * Production-safe HELLO golden assertions.
 *
 * IMMUTABLE: launch identity, initial-buy trade, launch-tx transfers, TokenLaunched uniqueness.
 * MUTABLE: total trade/candle counts, current holders, current market price — only soft presence checks.
 */
export async function verifyHello(): Promise<HelloCheck[]> {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for HELLO verify');
  }

  const pool = createPool(config.DATABASE_URL);
  try {
    return await verifyHelloWithDb(pool);
  } finally {
    await pool.end();
  }
}

export async function verifyHelloWithDb(db: Queryable): Promise<HelloCheck[]> {
  const checks: HelloCheck[] = [];
  const check = (
    name: string,
    kind: HelloAssertionKind,
    pass: boolean,
    detail?: string,
  ) => {
    checks.push({ name, kind, pass, detail });
  };

  // ─── IMMUTABLE: launch row ─────────────────────────────────────────────
  const launch = await query<{
    token_address: string;
    pool_id: string;
    creator_id: string;
    factory_address: string;
    fee_distributor_address: string;
    liquidity_locker_address: string;
    lp_token_id: string;
    quote_asset: string;
    deployer_address: string;
    launch_tx_hash: string;
    initial_buy_present: boolean;
    initial_buy_quote_raw: string;
    initial_buy_tokens_raw: string;
    opening_sqrt_price_x96: string;
    opening_tick: number;
    launch_fee_raw: string;
    metadata_hydrated: boolean;
  }>(db, `SELECT * FROM launches WHERE chain_id = $1 AND token_address = $2`, [
    HELLO.chainId,
    HELLO.token,
  ]);

  check('exactly_one_hello_launch', 'immutable', launch.rowCount === 1, `rows=${launch.rowCount}`);
  const L = launch.rows[0];
  if (L) {
    check('token_address', 'immutable', L.token_address.toLowerCase() === HELLO.token);
    check('pool_id', 'immutable', L.pool_id.toLowerCase() === HELLO.poolId);
    check('creator_id', 'immutable', L.creator_id.toLowerCase() === HELLO.creatorId);
    check('factory_exact', 'immutable', L.factory_address.toLowerCase() === HELLO.factory);
    check(
      'fee_distributor_exact',
      'immutable',
      L.fee_distributor_address.toLowerCase() === HELLO.feeDistributor,
    );
    check('locker_exact', 'immutable', L.liquidity_locker_address.toLowerCase() === HELLO.locker);
    check('lp_token_id', 'immutable', L.lp_token_id === HELLO.lpTokenId.toString());
    check('quote_native_eth', 'immutable', L.quote_asset.toLowerCase() === ZERO_ADDRESS);
    check('deployer_creator', 'immutable', L.deployer_address.toLowerCase() === HELLO.creator);
    check(
      'launch_tx_hash',
      'immutable',
      L.launch_tx_hash.toLowerCase() === HELLO.txHash,
    );
    check('initial_buy_present', 'immutable', L.initial_buy_present === true);
    check(
      'initial_buy_quote',
      'immutable',
      L.initial_buy_quote_raw === HELLO.initialBuyQuote.toString(),
    );
    check(
      'initial_buy_tokens',
      'immutable',
      L.initial_buy_tokens_raw === HELLO.initialBuyTokens.toString(),
    );
    check(
      'opening_sqrt',
      'immutable',
      L.opening_sqrt_price_x96 === HELLO.openingSqrtPriceX96.toString(),
    );
    check('opening_tick', 'immutable', L.opening_tick === HELLO.openingTick);
    check('launch_fee', 'immutable', L.launch_fee_raw === HELLO.launchFee.toString());
    check('metadata_hydrated', 'immutable', L.metadata_hydrated === true);
  }

  // ─── IMMUTABLE: token metadata ─────────────────────────────────────────
  const token = await query<{
    name: string;
    symbol: string;
    total_supply_raw: string;
    image_uri: string;
    description: string;
    twitter: string;
    website: string;
    decimals: number;
  }>(
    db,
    `SELECT name, symbol, total_supply_raw, image_uri, description, twitter, website, decimals
     FROM tokens WHERE chain_id = $1 AND token_address = $2`,
    [HELLO.chainId, HELLO.token],
  );
  const T = token.rows[0];
  check('token_name', 'immutable', T?.name === HELLO.metadata.name, T?.name);
  check('token_symbol', 'immutable', T?.symbol === HELLO.metadata.symbol, T?.symbol);
  check('total_supply', 'immutable', T?.total_supply_raw === HELLO.totalSupply.toString());
  if (T) {
    check('metadata_image', 'immutable', T.image_uri === HELLO.metadata.imageUri);
    check('metadata_description', 'immutable', T.description === HELLO.metadata.description);
    check('metadata_twitter', 'immutable', T.twitter === HELLO.metadata.twitter);
    check('metadata_website', 'immutable', T.website === HELLO.metadata.website);
    check('token_decimals', 'immutable', T.decimals === HELLO.tokenDecimals);
  }

  // ─── IMMUTABLE: creator identity ───────────────────────────────────────
  const creator = await query<{ creator_type: string; wallet_address: string }>(
    db,
    `SELECT creator_type, wallet_address FROM creators WHERE chain_id = $1 AND creator_id = $2`,
    [HELLO.chainId, HELLO.creatorId],
  );
  check('creator_type_wallet', 'immutable', creator.rows[0]?.creator_type === 'wallet');
  check(
    'creator_wallet',
    'immutable',
    creator.rows[0]?.wallet_address?.toLowerCase() === HELLO.creator,
  );

  // ─── IMMUTABLE: exactly one initial-buy trade ──────────────────────────
  const initialBuys = await query<{
    tx_hash: string;
    side: string;
    is_initial_buy: boolean;
    swap_sender: string;
    tx_from: string;
    trader_address: string;
    trader_attribution_type: string;
    amount0_raw: string;
    amount1_raw: string;
    quote_amount_raw: string;
    token_amount_raw: string;
    pool_id: string;
    token_address: string;
  }>(
    db,
    `SELECT * FROM trades
     WHERE chain_id = $1 AND token_address = $2 AND is_initial_buy = true`,
    [HELLO.chainId, HELLO.token],
  );
  check(
    'exactly_one_initial_buy_trade',
    'immutable',
    initialBuys.rowCount === 1,
    `rows=${initialBuys.rowCount}`,
  );
  const ib = initialBuys.rows[0];
  if (ib) {
    check('initial_buy_tx_hash', 'immutable', ib.tx_hash.toLowerCase() === HELLO.txHash);
    check('trade_side_buy', 'immutable', ib.side === 'buy');
    check('trade_is_initial_buy', 'immutable', ib.is_initial_buy === true);
    check(
      'swap_sender_router',
      'immutable',
      ib.swap_sender.toLowerCase() === HELLO.universalRouter,
    );
    check('tx_from_creator', 'immutable', ib.tx_from?.toLowerCase() === HELLO.creator);
    check('trader_is_tx_from', 'immutable', ib.trader_address?.toLowerCase() === HELLO.creator);
    check(
      'trader_attribution_tx_from',
      'immutable',
      ib.trader_attribution_type === 'tx_from',
    );
    check('amount0_negative', 'immutable', BigInt(ib.amount0_raw) < 0n);
    check('amount1_positive', 'immutable', BigInt(ib.amount1_raw) > 0n);
    check(
      'initial_buy_quote_amount',
      'immutable',
      ib.quote_amount_raw === HELLO.initialBuyQuote.toString(),
    );
    check(
      'initial_buy_token_amount',
      'immutable',
      ib.token_amount_raw === HELLO.initialBuyTokens.toString(),
    );
    check('initial_buy_pool_id', 'immutable', ib.pool_id.toLowerCase() === HELLO.poolId);
    check('initial_buy_token_address', 'immutable', ib.token_address.toLowerCase() === HELLO.token);
  }

  // ─── MUTABLE: total trades may grow ────────────────────────────────────
  const allTrades = await query<{ c: string }>(
    db,
    `SELECT COUNT(*)::text AS c FROM trades WHERE chain_id = $1 AND token_address = $2`,
    [HELLO.chainId, HELLO.token],
  );
  const totalTrades = Number(allTrades.rows[0]?.c ?? 0);
  check('total_trades_at_least_one', 'mutable', totalTrades >= 1, `total=${totalTrades}`);

  // ─── IMMUTABLE: launch-tx transfer facts (not current holder balances) ─
  const launchTransfers = await query<{
    from_address: string;
    to_address: string;
    amount_raw: string;
    transfer_class: string | null;
  }>(
    db,
    `SELECT from_address, to_address, amount_raw, transfer_class
     FROM transfers
     WHERE chain_id = $1 AND token_address = $2 AND tx_hash = $3
     ORDER BY log_index ASC`,
    [HELLO.chainId, HELLO.token, HELLO.txHash],
  );

  const toCreator = launchTransfers.rows.find(
    (r) =>
      r.to_address.toLowerCase() === HELLO.creator &&
      (r.transfer_class === 'initial_buy' ||
        r.amount_raw === HELLO.initialBuyTokens.toString()),
  );
  check(
    'launch_transfer_creator_exact',
    'immutable',
    Boolean(toCreator) && toCreator!.amount_raw === HELLO.initialBuyTokens.toString(),
    toCreator?.amount_raw,
  );

  const toDead = launchTransfers.rows.find(
    (r) => r.to_address.toLowerCase() === DEAD_ADDRESS,
  );
  check(
    'launch_transfer_dead_dust_exact',
    'immutable',
    Boolean(toDead) && toDead!.amount_raw === HELLO.deadBalance.toString(),
    toDead?.amount_raw,
  );

  const mintToFactory = launchTransfers.rows.find(
    (r) =>
      r.from_address.toLowerCase() === ZERO_ADDRESS &&
      r.to_address.toLowerCase() === HELLO.factory,
  );
  check(
    'launch_transfer_mint_to_factory',
    'immutable',
    Boolean(mintToFactory) && mintToFactory!.amount_raw === HELLO.totalSupply.toString(),
    mintToFactory?.amount_raw,
  );

  const lpFunding = launchTransfers.rows.find(
    (r) =>
      r.from_address.toLowerCase() === HELLO.factory &&
      r.to_address.toLowerCase() === HELLO.poolManager &&
      BigInt(r.amount_raw) > 0n,
  );
  check(
    'launch_transfer_pool_manager_inventory',
    'immutable',
    Boolean(lpFunding),
    lpFunding?.amount_raw,
  );

  // Factory should not retain inventory after the launch-tx settlement path.
  const factoryEndBalance = launchTransfers.rows.reduce((acc, r) => {
    const amt = BigInt(r.amount_raw);
    if (r.to_address.toLowerCase() === HELLO.factory) return acc + amt;
    if (r.from_address.toLowerCase() === HELLO.factory) return acc - amt;
    return acc;
  }, 0n);
  check(
    'launch_tx_factory_balance_zero',
    'immutable',
    factoryEndBalance === 0n,
    factoryEndBalance.toString(),
  );

  // ─── MUTABLE: current holders — presence only for system/dead dust ─────
  const holders = await query<{ holder_address: string; balance_raw: string }>(
    db,
    `SELECT holder_address, balance_raw FROM holder_balances
     WHERE chain_id = $1 AND token_address = $2`,
    [HELLO.chainId, HELLO.token],
  );
  const byHolder = Object.fromEntries(
    holders.rows.map((r) => [r.holder_address.toLowerCase(), r.balance_raw]),
  );
  // Dead dust is effectively immutable unless someone moves it (they can't).
  check(
    'dead_balance_current',
    'immutable',
    byHolder[DEAD_ADDRESS] === HELLO.deadBalance.toString(),
    byHolder[DEAD_ADDRESS],
  );
  check(
    'zero_address_absent',
    'immutable',
    !byHolder[ZERO_ADDRESS],
  );
  check(
    'pool_manager_balance_positive',
    'mutable',
    Boolean(byHolder[HELLO.poolManager] && BigInt(byHolder[HELLO.poolManager]!) > 0n),
    byHolder[HELLO.poolManager],
  );
  // Creator current balance is mutable market state — do not assert == initial buy.
  check(
    'creator_holder_row_present',
    'mutable',
    byHolder[HELLO.creator] != null && BigInt(byHolder[HELLO.creator]!) >= 0n,
    byHolder[HELLO.creator],
  );

  // ─── IMMUTABLE: TokenLaunched uniqueness on launch tx ──────────────────
  const tokenLaunched = await query<{ c: string }>(
    db,
    `SELECT COUNT(*)::text AS c FROM raw_chain_events
     WHERE chain_id = $1 AND tx_hash = $2 AND decoded_event_name = 'TokenLaunched'
       AND is_canonical = true`,
    [HELLO.chainId, HELLO.txHash],
  );
  check(
    'token_launched_once',
    'immutable',
    tokenLaunched.rows[0]?.c === '1',
    tokenLaunched.rows[0]?.c,
  );

  const dupLaunchEvents = await query<{ c: string }>(
    db,
    `SELECT COUNT(*)::text AS c FROM raw_chain_events
     WHERE chain_id = $1 AND decoded_event_name = 'TokenLaunched'
       AND is_canonical = true
       AND (
         decoded_payload->>'token' ILIKE $2
         OR contract_address = $3
       )`,
    [HELLO.chainId, HELLO.token, HELLO.factory],
  );
  // Soft: at least the one launch event; hard fail if somehow zero.
  // Strict uniqueness of HELLO TokenLaunched is covered by token_launched_once on tx.
  check(
    'token_launched_events_present',
    'immutable',
    Number(dupLaunchEvents.rows[0]?.c ?? 0) >= 1,
    dupLaunchEvents.rows[0]?.c,
  );

  const rawOnLaunchTx = await query<{ c: string }>(
    db,
    `SELECT COUNT(*)::text AS c FROM raw_chain_events
     WHERE chain_id = $1 AND tx_hash = $2 AND is_canonical = true`,
    [HELLO.chainId, HELLO.txHash],
  );
  check(
    'raw_events_present',
    'immutable',
    Number(rawOnLaunchTx.rows[0]?.c ?? 0) > 0,
    rawOnLaunchTx.rows[0]?.c,
  );

  // ─── MUTABLE: market state row must exist; price/counts may evolve ─────
  const market = await query<{ token_address: string }>(
    db,
    `SELECT token_address FROM token_market_state
     WHERE chain_id = $1 AND token_address = $2`,
    [HELLO.chainId, HELLO.token],
  );
  check('market_state_present', 'mutable', market.rowCount === 1);

  // ─── MUTABLE candles: launch 1m bucket must exist and include initial ──
  const launchCandle = await query<{
    trade_count: number;
    interval: string;
    bucket_start: string;
    first_trade_block: string | null;
  }>(
    db,
    `SELECT trade_count, interval, bucket_start, first_trade_block
     FROM candles
     WHERE chain_id = $1 AND pool_id = $2 AND interval = '1m' AND bucket_start = $3`,
    [HELLO.chainId, HELLO.poolId, HELLO_LAUNCH_1M_BUCKET],
  );
  check(
    'launch_1m_candle_exists',
    'immutable',
    launchCandle.rowCount === 1,
    `bucket=${HELLO_LAUNCH_1M_BUCKET}`,
  );
  const lc = launchCandle.rows[0];
  if (lc) {
    check(
      'launch_1m_candle_includes_trade',
      'immutable',
      lc.trade_count >= 1,
      `trade_count=${lc.trade_count}`,
    );
    check(
      'launch_1m_candle_first_block',
      'immutable',
      lc.first_trade_block == null ||
        BigInt(lc.first_trade_block) === BigInt(HELLO.blockNumber),
      lc.first_trade_block ?? undefined,
    );
  }

  const candleCount = await query<{ c: string }>(
    db,
    `SELECT COUNT(*)::text AS c FROM candles
     WHERE chain_id = $1 AND pool_id = $2 AND interval = '1m'`,
    [HELLO.chainId, HELLO.poolId],
  );
  check(
    'one_minute_candles_at_least_one',
    'mutable',
    Number(candleCount.rows[0]?.c ?? 0) >= 1,
    candleCount.rows[0]?.c,
  );

  // ─── Checkpoints / health (production-safe) ────────────────────────────
  const helloCp = await query<{ last_block_number: string }>(
    db,
    `SELECT last_block_number FROM indexer_checkpoints
     WHERE chain_id = $1 AND stream_name = $2`,
    [HELLO.chainId, HELLO.streamName],
  );
  // hello_smoke may remain pinned at HELLO after one-shot backfill.
  if (helloCp.rowCount === 1) {
    check(
      'checkpoint_hello_smoke',
      'immutable',
      helloCp.rows[0]?.last_block_number === String(HELLO.blockNumber),
      helloCp.rows[0]?.last_block_number,
    );
  } else {
    check(
      'checkpoint_hello_smoke',
      'mutable',
      true,
      'absent — live main stream only',
    );
  }

  const mainCp = await query<{ last_block_number: string }>(
    db,
    `SELECT last_block_number FROM indexer_checkpoints
     WHERE chain_id = $1 AND stream_name = 'main'`,
    [HELLO.chainId],
  );
  if (mainCp.rowCount === 1) {
    check(
      'checkpoint_main_past_hello',
      'mutable',
      BigInt(mainCp.rows[0]!.last_block_number) >= BigInt(HELLO.blockNumber),
      mainCp.rows[0]?.last_block_number,
    );
  }

  const health = await query<{ latest_indexed_block: string }>(
    db,
    `SELECT latest_indexed_block FROM indexer_health WHERE chain_id = $1`,
    [HELLO.chainId],
  );
  const healthBlock = health.rows[0]?.latest_indexed_block;
  check(
    'health_latest_indexed_block',
    'mutable',
    healthBlock != null && BigInt(healthBlock) >= BigInt(HELLO.blockNumber),
    healthBlock,
  );

  return checks;
}

/**
 * Pure production-safety evaluator for unit tests — no DB.
 * Models the critical trade/candle/identity branches of verifyHello.
 */
export function evaluateHelloTradeInvariants(input: {
  launches: Array<{ token_address: string; initial_buy_quote_raw: string; pool_id: string; creator_id: string }>;
  initialBuyTrades: Array<{
    tx_hash: string;
    is_initial_buy: boolean;
    side: string;
    quote_amount_raw: string;
    token_amount_raw: string;
  }>;
  totalTrades: number;
  tokenName?: string;
  tokenSymbol?: string;
}): HelloCheck[] {
  const checks: HelloCheck[] = [];
  const check = (
    name: string,
    kind: HelloAssertionKind,
    pass: boolean,
    detail?: string,
  ) => {
    checks.push({ name, kind, pass, detail });
  };

  check('exactly_one_hello_launch', 'immutable', input.launches.length === 1);
  const L = input.launches[0];
  if (L) {
    check('token_address', 'immutable', L.token_address.toLowerCase() === HELLO.token);
    check('pool_id', 'immutable', L.pool_id.toLowerCase() === HELLO.poolId);
    check('creator_id', 'immutable', L.creator_id.toLowerCase() === HELLO.creatorId);
    check(
      'initial_buy_quote',
      'immutable',
      L.initial_buy_quote_raw === HELLO.initialBuyQuote.toString(),
    );
  }
  if (input.tokenName !== undefined) {
    check('token_name', 'immutable', input.tokenName === HELLO.metadata.name);
  }
  if (input.tokenSymbol !== undefined) {
    check('token_symbol', 'immutable', input.tokenSymbol === HELLO.metadata.symbol);
  }

  check(
    'exactly_one_initial_buy_trade',
    'immutable',
    input.initialBuyTrades.length === 1,
    `rows=${input.initialBuyTrades.length}`,
  );
  const ib = input.initialBuyTrades[0];
  if (ib) {
    check('initial_buy_tx_hash', 'immutable', ib.tx_hash.toLowerCase() === HELLO.txHash);
    check('trade_side_buy', 'immutable', ib.side === 'buy');
    check('trade_is_initial_buy', 'immutable', ib.is_initial_buy === true);
    check(
      'initial_buy_quote_amount',
      'immutable',
      ib.quote_amount_raw === HELLO.initialBuyQuote.toString(),
    );
    check(
      'initial_buy_token_amount',
      'immutable',
      ib.token_amount_raw === HELLO.initialBuyTokens.toString(),
    );
  }
  check('total_trades_at_least_one', 'mutable', input.totalTrades >= 1, `total=${input.totalTrades}`);

  return checks;
}

export function formatHelloChecks(checks: HelloCheck[]): string {
  const lines = checks.map(
    (c) =>
      `${c.pass ? 'PASS' : 'FAIL'}  [${c.kind}] ${c.name}${c.detail ? ` (${c.detail})` : ''}`,
  );
  const failed = checks.filter((c) => !c.pass).length;
  lines.push(`--- ${checks.length - failed}/${checks.length} passed ---`);
  return lines.join('\n');
}
