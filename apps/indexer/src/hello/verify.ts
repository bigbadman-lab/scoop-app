import { createPool, query } from '@scoop/db';
import { DEAD_ADDRESS, ZERO_ADDRESS } from '@scoop/shared';
import { loadConfig } from '../config.js';
import { HELLO } from './fixture.js';

export interface HelloCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

/**
 * Golden assertions for the HELLO vertical slice. Returns PASS/FAIL list.
 */
export async function verifyHello(): Promise<HelloCheck[]> {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for HELLO verify');
  }

  const pool = createPool(config.DATABASE_URL);
  const checks: HelloCheck[] = [];

  const check = (name: string, pass: boolean, detail?: string) => {
    checks.push({ name, pass, detail });
  };

  try {
    const launch = await query<{
      token_address: string;
      pool_id: string;
      creator_id: string;
      initial_buy_present: boolean;
      initial_buy_quote_raw: string;
      initial_buy_tokens_raw: string;
      opening_sqrt_price_x96: string;
      opening_tick: number;
      launch_fee_raw: string;
      metadata_hydrated: boolean;
    }>(pool, `SELECT * FROM launches WHERE chain_id = $1 AND token_address = $2`, [
      HELLO.chainId,
      HELLO.token,
    ]);

    check('exactly_one_hello_launch', launch.rowCount === 1, `rows=${launch.rowCount}`);
    const L = launch.rows[0];
    if (L) {
      check('pool_id', L.pool_id.toLowerCase() === HELLO.poolId);
      check('creator_id', L.creator_id.toLowerCase() === HELLO.creatorId);
      check('initial_buy_present', L.initial_buy_present === true);
      check('initial_buy_quote', L.initial_buy_quote_raw === HELLO.initialBuyQuote.toString());
      check('initial_buy_tokens', L.initial_buy_tokens_raw === HELLO.initialBuyTokens.toString());
      check(
        'opening_sqrt',
        L.opening_sqrt_price_x96 === HELLO.openingSqrtPriceX96.toString(),
      );
      check('opening_tick', L.opening_tick === HELLO.openingTick);
      check('launch_fee', L.launch_fee_raw === HELLO.launchFee.toString());
      check('metadata_hydrated', L.metadata_hydrated === true);
    }

    const token = await query<{ name: string; symbol: string; total_supply_raw: string }>(
      pool,
      `SELECT name, symbol, total_supply_raw FROM tokens WHERE chain_id = $1 AND token_address = $2`,
      [HELLO.chainId, HELLO.token],
    );
    const T = token.rows[0];
    check('token_name', T?.name === HELLO.metadata.name, T?.name);
    check('token_symbol', T?.symbol === HELLO.metadata.symbol, T?.symbol);
    check('total_supply', T?.total_supply_raw === HELLO.totalSupply.toString());

    const creator = await query<{ creator_type: string; wallet_address: string }>(
      pool,
      `SELECT creator_type, wallet_address FROM creators WHERE chain_id = $1 AND creator_id = $2`,
      [HELLO.chainId, HELLO.creatorId],
    );
    check('creator_type_wallet', creator.rows[0]?.creator_type === 'wallet');
    check(
      'creator_wallet',
      creator.rows[0]?.wallet_address?.toLowerCase() === HELLO.creator,
    );

    const trade = await query<{
      side: string;
      is_initial_buy: boolean;
      swap_sender: string;
      tx_from: string;
      trader_address: string;
      trader_attribution_type: string;
      amount0_raw: string;
      amount1_raw: string;
    }>(
      pool,
      `SELECT * FROM trades WHERE chain_id = $1 AND token_address = $2`,
      [HELLO.chainId, HELLO.token],
    );
    check('one_initial_buy_trade', trade.rowCount === 1, `rows=${trade.rowCount}`);
    const tr = trade.rows[0];
    if (tr) {
      check('trade_side_buy', tr.side === 'buy');
      check('trade_is_initial_buy', tr.is_initial_buy === true);
      check('swap_sender_router', tr.swap_sender.toLowerCase() === HELLO.universalRouter);
      check('tx_from_creator', tr.tx_from?.toLowerCase() === HELLO.creator);
      check('trader_is_tx_from', tr.trader_address?.toLowerCase() === HELLO.creator);
      check('trader_attribution_tx_from', tr.trader_attribution_type === 'tx_from');
      check('amount0_negative', BigInt(tr.amount0_raw) < 0n);
      check('amount1_positive', BigInt(tr.amount1_raw) > 0n);
    }

    const holders = await query<{ holder_address: string; balance_raw: string }>(
      pool,
      `SELECT holder_address, balance_raw FROM holder_balances
       WHERE chain_id = $1 AND token_address = $2`,
      [HELLO.chainId, HELLO.token],
    );
    const byHolder = Object.fromEntries(
      holders.rows.map((r) => [r.holder_address.toLowerCase(), r.balance_raw]),
    );
    check('creator_balance', byHolder[HELLO.creator] === HELLO.initialBuyTokens.toString());
    check('dead_balance', byHolder[DEAD_ADDRESS] === HELLO.deadBalance.toString());
    check('factory_absent_or_zero', !byHolder[HELLO.factory] || byHolder[HELLO.factory] === '0');
    check('zero_address_absent', !byHolder[ZERO_ADDRESS]);
    check(
      'pool_manager_balance_positive',
      Boolean(byHolder[HELLO.poolManager] && BigInt(byHolder[HELLO.poolManager]!) > 0n),
      byHolder[HELLO.poolManager],
    );

    const launchFull = await query<{
      factory_address: string;
      fee_distributor_address: string;
      liquidity_locker_address: string;
      lp_token_id: string;
      quote_asset: string;
      deployer_address: string;
    }>(pool, `SELECT * FROM launches WHERE chain_id = $1 AND token_address = $2`, [
      HELLO.chainId,
      HELLO.token,
    ]);
    const LF = launchFull.rows[0];
    if (LF) {
      check('factory_exact', LF.factory_address.toLowerCase() === HELLO.factory);
      check('fee_distributor_exact', LF.fee_distributor_address.toLowerCase() === HELLO.feeDistributor);
      check('locker_exact', LF.liquidity_locker_address.toLowerCase() === HELLO.locker);
      check('lp_token_id', LF.lp_token_id === HELLO.lpTokenId.toString());
      check('quote_native_eth', LF.quote_asset.toLowerCase() === ZERO_ADDRESS);
      check('deployer_creator', LF.deployer_address.toLowerCase() === HELLO.creator);
    }

    const tokenMeta = await query<{
      image_uri: string;
      description: string;
      twitter: string;
      website: string;
      decimals: number;
    }>(
      pool,
      `SELECT image_uri, description, twitter, website, decimals
       FROM tokens WHERE chain_id = $1 AND token_address = $2`,
      [HELLO.chainId, HELLO.token],
    );
    const TM = tokenMeta.rows[0];
    if (TM) {
      check('metadata_image', TM.image_uri === HELLO.metadata.imageUri);
      check('metadata_description', TM.description === HELLO.metadata.description);
      check('metadata_twitter', TM.twitter === HELLO.metadata.twitter);
      check('metadata_website', TM.website === HELLO.metadata.website);
      check('token_decimals', TM.decimals === HELLO.tokenDecimals);
    }

    const tokenLaunched = await query<{ c: string }>(
      pool,
      `SELECT COUNT(*)::text AS c FROM raw_chain_events
       WHERE chain_id = $1 AND tx_hash = $2 AND decoded_event_name = 'TokenLaunched'`,
      [HELLO.chainId, HELLO.txHash],
    );
    check('token_launched_once', tokenLaunched.rows[0]?.c === '1', tokenLaunched.rows[0]?.c);

    const market = await query<{
      price_quote_x18: string;
      quote_usd_x18: string | null;
      price_usd_x18: string | null;
    }>(
      pool,
      `SELECT price_quote_x18, quote_usd_x18, price_usd_x18
       FROM token_market_state WHERE chain_id = $1 AND token_address = $2`,
      [HELLO.chainId, HELLO.token],
    );
    check('market_state_present', market.rowCount === 1);
    check('usd_fields_null', market.rows[0]?.quote_usd_x18 == null && market.rows[0]?.price_usd_x18 == null);

    const candle = await query<{ trade_count: number; interval: string }>(
      pool,
      `SELECT trade_count, interval FROM candles WHERE chain_id = $1 AND pool_id = $2`,
      [HELLO.chainId, HELLO.poolId],
    );
    check('one_1m_candle', candle.rowCount === 1 && candle.rows[0]?.interval === '1m');
    check('candle_trade_count_1', candle.rows[0]?.trade_count === 1);

    const checkpoint = await query<{ last_block_number: string }>(
      pool,
      `SELECT last_block_number FROM indexer_checkpoints
       WHERE chain_id = $1 AND stream_name = $2`,
      [HELLO.chainId, HELLO.streamName],
    );
    check(
      'checkpoint_hello_smoke',
      checkpoint.rows[0]?.last_block_number === String(HELLO.blockNumber),
    );

    const health = await query<{ latest_indexed_block: string }>(
      pool,
      `SELECT latest_indexed_block FROM indexer_health WHERE chain_id = $1`,
      [HELLO.chainId],
    );
    // Live indexing (6A.6+) advances health beyond the HELLO block; require at least HELLO.
    const healthBlock = health.rows[0]?.latest_indexed_block;
    check(
      'health_latest_indexed_block',
      healthBlock != null && BigInt(healthBlock) >= BigInt(HELLO.blockNumber),
    );

    const dup = await query<{ c: string }>(
      pool,
      `SELECT COUNT(*)::text AS c FROM raw_chain_events
       WHERE chain_id = $1 AND tx_hash = $2`,
      [HELLO.chainId, HELLO.txHash],
    );
    check('raw_events_present', Number(dup.rows[0]?.c ?? 0) > 0, dup.rows[0]?.c);
  } finally {
    await pool.end();
  }

  return checks;
}

export function formatHelloChecks(checks: HelloCheck[]): string {
  const lines = checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
  const failed = checks.filter((c) => !c.pass).length;
  lines.push(`--- ${checks.length - failed}/${checks.length} passed ---`);
  return lines.join('\n');
}
