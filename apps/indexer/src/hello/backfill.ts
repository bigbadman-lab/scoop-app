import { createPublicClient, http, type Hex } from 'viem';
import { createPool, withTransaction } from '@scoop/db';
import { SCOOP_CHAIN_ID } from '@scoop/shared';
import { loadConfig } from '../config.js';
import { HELLO, HELLO_BLOCK, HELLO_TX_HASH } from './fixture.js';
import { decodeHelloLogs } from './decode.js';
import { hydrateHello } from './hydrate.js';
import { normalizeHello } from './normalize.js';

function logInfo(message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level: 'info', message, ...fields }));
}

/**
 * One-shot HELLO backfill for block 55863290 / launch tx only.
 * Allowed while SCOOP_INDEXING_ENABLED=false (does not start a live loop).
 */
export async function backfillHello(): Promise<void> {
  const config = loadConfig();

  if (config.SCOOP_CHAIN_ID !== SCOOP_CHAIN_ID || config.SCOOP_CHAIN_ID !== HELLO.chainId) {
    throw new Error(`Refusing HELLO backfill on chain ${config.SCOOP_CHAIN_ID}`);
  }

  if (!config.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for HELLO backfill');
  }

  const rpcUrl = config.ROBINHOOD_RPC_URL ?? config.ROBINHOOD_FALLBACK_RPC_URL;
  if (!rpcUrl) {
    throw new Error('ROBINHOOD_RPC_URL or ROBINHOOD_FALLBACK_RPC_URL is required');
  }

  logInfo('HELLO backfill starting', {
    chainId: HELLO.chainId,
    block: HELLO_BLOCK,
    tx: HELLO_TX_HASH,
    indexingEnabled: config.SCOOP_INDEXING_ENABLED,
  });

  const client = createPublicClient({ transport: http(rpcUrl) });
  const block = await client.getBlock({ blockNumber: BigInt(HELLO_BLOCK), includeTransactions: false });
  const receipt = await client.getTransactionReceipt({ hash: HELLO_TX_HASH as Hex });
  const tx = await client.getTransaction({ hash: HELLO_TX_HASH as Hex });

  if (Number(receipt.blockNumber) !== HELLO_BLOCK) {
    throw new Error(`HELLO tx not in block ${HELLO_BLOCK}`);
  }

  const decoded = decodeHelloLogs(receipt);
  const hydrated = await hydrateHello(client);

  const pool = createPool(config.DATABASE_URL);
  try {
    await withTransaction(pool, async (db) => {
      await normalizeHello(db, {
        chainId: HELLO.chainId,
        blockNumber: block.number,
        blockHash: block.hash!,
        blockTimestamp: block.timestamp,
        txHash: receipt.transactionHash,
        txIndex: receipt.transactionIndex,
        txFrom: tx.from,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          logIndex: Number(log.logIndex),
          topics: [...(log.topics ?? [])],
          data: log.data,
        })),
        decoded,
        tokenMeta: hydrated.token,
      });
    });
  } finally {
    await pool.end();
  }

  logInfo('HELLO backfill complete', {
    block: HELLO_BLOCK,
    decodedEvents: decoded.length,
    stream: HELLO.streamName,
  });
}
