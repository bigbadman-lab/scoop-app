/**
 * Periodic Pump holder-count refresh — independent of trade ingest.
 */

import {
  updatePumpHolderCount,
  type Queryable,
} from '@scoop/db';
import { createSolanaRpc, type SolanaRpcCall } from '../provider/alchemy-rpc.js';
import { logJson } from '../log.js';
import {
  fetchSolanaHolderCount,
  type SolanaHolderCountResult,
} from './fetch-holder-count.js';

export type HolderRefreshDeps = {
  db: Queryable;
  rpc: SolanaRpcCall;
  /** Current watchlist mints (exact base58). */
  getMints: () => readonly string[];
  fetchHolderCount?: (
    rpc: SolanaRpcCall,
    mint: string,
  ) => Promise<SolanaHolderCountResult>;
  persistHolderCount?: typeof updatePumpHolderCount;
  now?: () => Date;
};

export type HolderRefreshCycleResult = {
  attempted: number;
  succeeded: number;
  failed: number;
};

/**
 * Sequential per-mint refresh. One mint failure does not abort the rest.
 * Failed fetch → no DB write (keeps prior count / null).
 */
export async function refreshPumpHolderCounts(
  deps: HolderRefreshDeps,
): Promise<HolderRefreshCycleResult> {
  const mints = deps.getMints();
  const fetch = deps.fetchHolderCount ?? fetchSolanaHolderCount;
  const persist = deps.persistHolderCount ?? updatePumpHolderCount;
  const now = deps.now ?? (() => new Date());

  let succeeded = 0;
  let failed = 0;

  for (const mint of mints) {
    try {
      const result = await fetch(deps.rpc, mint);
      await persist(deps.db, {
        mint,
        holderCount: result.holderCount,
        holdersUpdatedAt: now(),
      });
      succeeded += 1;
      logJson('info', 'pump holder refresh ok', {
        mint,
        holderCount: result.holderCount,
        positiveTokenAccountCount: result.positiveTokenAccountCount,
        totalTokenAccountCount: result.totalTokenAccountCount,
        pagesFetched: result.pagesFetched,
      });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logJson('error', 'pump holder refresh failed', {
        mint,
        error: message,
      });
    }
  }

  return { attempted: mints.length, succeeded, failed };
}

export function createHolderRefreshRpc(rpcUrl: string): SolanaRpcCall {
  return createSolanaRpc(rpcUrl);
}
