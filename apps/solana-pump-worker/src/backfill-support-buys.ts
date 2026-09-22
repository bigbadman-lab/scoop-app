/**
 * Bounded one-shot backfill: pump_trades → scoop_support_buys for the support wallet.
 * Usage: pnpm --filter @scoop/solana-pump-worker exec tsx src/backfill-support-buys.ts
 */

import { createPool, backfillScoopSupportBuysFromPumpTrades } from '@scoop/db';
import { SCOOP_SUPPORT_WALLET } from '@scoop/shared';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  const limit = Number.parseInt(process.env.SCOOP_SUPPORT_BACKFILL_LIMIT ?? '500', 10);
  const pool = createPool(databaseUrl);
  try {
    const result = await backfillScoopSupportBuysFromPumpTrades(pool, {
      limit: Number.isFinite(limit) ? limit : 500,
    });
    console.log(
      JSON.stringify({
        ok: true,
        supportWallet: SCOOP_SUPPORT_WALLET,
        scanned: result.scanned,
        inserted: result.inserted,
        mints: result.mints,
      }),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
