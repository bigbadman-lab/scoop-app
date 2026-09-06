import { createPool, withTransaction } from '@scoop/db';
import { loadConfig } from '../config.js';
import { HELLO } from './fixture.js';

/**
 * Delete HELLO-scoped rows only when SCOOP_ALLOW_HELLO_RESET=true.
 */
export async function resetHello(): Promise<void> {
  if (process.env.SCOOP_ALLOW_HELLO_RESET !== 'true') {
    throw new Error('Refusing HELLO reset — set SCOOP_ALLOW_HELLO_RESET=true');
  }

  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for HELLO reset');
  }

  const pool = createPool(config.DATABASE_URL);
  const chainId = HELLO.chainId;
  const token = HELLO.token;
  const poolId = HELLO.poolId;
  const txHash = HELLO.txHash;
  const creatorId = HELLO.creatorId;
  const stream = HELLO.streamName;

  try {
    await withTransaction(pool, async (db) => {
      await db.query(`DELETE FROM candles WHERE chain_id = $1 AND pool_id = $2`, [chainId, poolId]);
      await db.query(`DELETE FROM token_market_state WHERE chain_id = $1 AND token_address = $2`, [
        chainId,
        token,
      ]);
      await db.query(`DELETE FROM holder_balances WHERE chain_id = $1 AND token_address = $2`, [
        chainId,
        token,
      ]);
      await db.query(`DELETE FROM transfers WHERE chain_id = $1 AND token_address = $2`, [
        chainId,
        token,
      ]);
      await db.query(`DELETE FROM trades WHERE chain_id = $1 AND token_address = $2`, [
        chainId,
        token,
      ]);
      await db.query(`DELETE FROM pools WHERE chain_id = $1 AND pool_id = $2`, [chainId, poolId]);
      await db.query(`DELETE FROM launches WHERE chain_id = $1 AND token_address = $2`, [
        chainId,
        token,
      ]);
      await db.query(`DELETE FROM tokens WHERE chain_id = $1 AND token_address = $2`, [
        chainId,
        token,
      ]);
      await db.query(`DELETE FROM creators WHERE chain_id = $1 AND creator_id = $2`, [
        chainId,
        creatorId,
      ]);
      await db.query(`DELETE FROM raw_chain_events WHERE chain_id = $1 AND tx_hash = $2`, [
        chainId,
        txHash,
      ]);
      await db.query(
        `DELETE FROM address_classifications
         WHERE chain_id = $1 AND related_token = $2`,
        [chainId, token],
      );
      await db.query(
        `DELETE FROM indexer_checkpoints WHERE chain_id = $1 AND stream_name = $2`,
        [chainId, stream],
      );
      await db.query(
        `UPDATE indexer_health
         SET latest_indexed_block = NULL,
             notes = 'HELLO reset — live indexing disabled',
             updated_at = NOW()
         WHERE chain_id = $1`,
        [chainId],
      );
    });
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'info',
        message: 'HELLO-scoped rows deleted',
        chainId,
        token,
        stream,
      }),
    );
  } finally {
    await pool.end();
  }
}
