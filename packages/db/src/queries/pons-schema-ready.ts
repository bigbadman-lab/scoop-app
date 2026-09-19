/**
 * Gate 7 production schema readiness for Pons market indexing.
 * Blocks public Pons launches until Gate 6 migration columns exist.
 */
import type { Queryable } from '@scoop/db';

export type PonsSchemaReadiness = {
  ready: boolean;
  reason: string | null;
  hasMarketSource: boolean;
  hasCurveAddress: boolean;
};

/**
 * Fail-closed check: launches.market_source + curve_address must exist.
 * Does not require production migration to have been run in this process —
 * callers decide enablement.
 */
export async function checkPonsMarketSchemaReady(
  db: Queryable,
): Promise<PonsSchemaReadiness> {
  try {
    const result = await db.query<{ column_name: string }>(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'launches'
        AND column_name IN ('market_source', 'curve_address')
      `,
    );
    const cols = new Set(result.rows.map((r) => String(r.column_name)));
    const hasMarketSource = cols.has('market_source');
    const hasCurveAddress = cols.has('curve_address');
    const ready = hasMarketSource && hasCurveAddress;
    return {
      ready,
      hasMarketSource,
      hasCurveAddress,
      reason: ready
        ? null
        : 'BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY',
    };
  } catch {
    return {
      ready: false,
      hasMarketSource: false,
      hasCurveAddress: false,
      reason: 'BLOCKED — PONS MARKET INDEXING SCHEMA NOT READY',
    };
  }
}
