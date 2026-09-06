import type { Queryable } from '@scoop/db';
import { upsertHolderBalance, deleteHolderBalance } from '@scoop/db';
import { normalizeAddress, ZERO_ADDRESS } from '@scoop/shared';

export interface HolderDelta {
  from: string;
  to: string;
  amount: bigint;
  blockNumber: number;
}

/** Apply a single transfer delta to holder_balances (fold update). */
export async function applyHolderTransfer(
  db: Queryable,
  args: {
    chainId: number;
    tokenAddress: string;
    transfer: HolderDelta;
    systemAddresses: Set<string>;
  },
): Promise<void> {
  const token = normalizeAddress(args.tokenAddress);
  const from = normalizeAddress(args.transfer.from);
  const to = normalizeAddress(args.transfer.to);
  const amount = args.transfer.amount;
  const block = args.transfer.blockNumber;

  const adjust = async (address: string, delta: bigint) => {
    if (address === ZERO_ADDRESS) return;
    const existing = await db.query<{
      balance_raw: string;
      first_seen_block: string;
    }>(
      `SELECT balance_raw, first_seen_block FROM holder_balances
       WHERE chain_id = $1 AND token_address = $2 AND holder_address = $3`,
      [args.chainId, token, address],
    );
    const prev = existing.rows[0];
    const next = (prev ? BigInt(prev.balance_raw) : 0n) + delta;
    if (next === 0n) {
      if (prev) {
        await deleteHolderBalance(db, args.chainId, token, address);
      }
      return;
    }
    const isSystem = args.systemAddresses.has(address);
    await upsertHolderBalance(db, {
      chainId: args.chainId,
      tokenAddress: token,
      holderAddress: address,
      balanceRaw: next,
      holderClass: isSystem ? 'system' : 'user',
      isSystemAddress: isSystem,
      firstSeenBlock: prev ? BigInt(prev.first_seen_block) : block,
      lastUpdatedBlock: block,
    });
  };

  await adjust(from, -amount);
  await adjust(to, amount);
}

export async function countHolders(
  db: Queryable,
  chainId: number,
  tokenAddress: string,
): Promise<{ all: number; retail: number }> {
  const result = await db.query<{ all_count: string; retail_count: string }>(
    `SELECT
      COUNT(*) FILTER (WHERE balance_raw > 0)::text AS all_count,
      COUNT(*) FILTER (WHERE balance_raw > 0 AND is_system_address = FALSE)::text AS retail_count
     FROM holder_balances
     WHERE chain_id = $1 AND token_address = $2`,
    [chainId, normalizeAddress(tokenAddress)],
  );
  return {
    all: Number(result.rows[0]?.all_count ?? 0),
    retail: Number(result.rows[0]?.retail_count ?? 0),
  };
}
