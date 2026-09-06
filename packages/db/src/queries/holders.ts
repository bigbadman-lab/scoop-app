import type { Queryable } from '../types.js';
import { normalizeAddress } from '../hex.js';
import {
  clampLimit,
  clampOffset,
  formatRawAmount,
  percentOfSupplyBps,
  percentOfSupplyX18,
} from '../decimal.js';
import type { HolderItem } from '../dto.js';

export interface GetHoldersOptions {
  retailOnly?: boolean;
  limit?: number;
  offset?: number;
}

export async function getHolders(
  db: Queryable,
  chainId: number,
  tokenAddressInput: string,
  options: GetHoldersOptions = {},
): Promise<HolderItem[]> {
  const tokenAddress = normalizeAddress(tokenAddressInput);
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);

  const params: unknown[] = [chainId, tokenAddress];
  const clauses = ['hb.chain_id = $1', 'hb.token_address = $2', 'hb.balance_raw > 0'];

  if (options.retailOnly) {
    clauses.push(`hb.is_system_address = FALSE`);
    clauses.push(`hb.holder_class = 'user'`);
  }

  params.push(limit);
  const limitParam = params.length;
  params.push(offset);
  const offsetParam = params.length;

  const result = await db.query(
    `
    SELECT
      hb.chain_id,
      hb.token_address,
      hb.holder_address,
      hb.balance_raw::text AS balance_raw,
      hb.holder_class,
      hb.is_system_address,
      hb.first_seen_block,
      hb.last_updated_block,
      t.decimals,
      t.total_supply_raw::text AS total_supply_raw
    FROM holder_balances hb
    INNER JOIN tokens t
      ON t.chain_id = hb.chain_id AND t.token_address = hb.token_address
    WHERE ${clauses.join(' AND ')}
    ORDER BY hb.balance_raw DESC, hb.holder_address ASC
    LIMIT $${limitParam} OFFSET $${offsetParam}
    `,
    params,
  );

  return result.rows.map((row) => {
    const balanceRaw = String(row.balance_raw);
    const totalSupplyRaw = String(row.total_supply_raw);
    const decimals = Number(row.decimals);

    return {
      chainId: Number(row.chain_id),
      tokenAddress: String(row.token_address),
      holderAddress: String(row.holder_address),
      balanceRaw,
      balanceDisplay: formatRawAmount(balanceRaw, decimals),
      percentOfSupplyBps: percentOfSupplyBps(balanceRaw, totalSupplyRaw),
      percentOfSupplyX18: percentOfSupplyX18(balanceRaw, totalSupplyRaw),
      holderClass: String(row.holder_class),
      isSystemAddress: Boolean(row.is_system_address),
      firstSeenBlock: Number(row.first_seen_block),
      lastUpdatedBlock: Number(row.last_updated_block),
    } satisfies HolderItem;
  });
}
