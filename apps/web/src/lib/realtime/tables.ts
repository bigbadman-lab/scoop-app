/**
 * Allowed Supabase Realtime tables for client subscriptions.
 * Client must use NEXT_PUBLIC_SUPABASE_ANON_KEY only — never DATABASE_URL
 * or service-role keys. Tables listed here are the only ones intended for
 * product realtime; raw_chain_events / checkpoints are not included.
 */
export const REALTIME_TABLES = [
  'launches',
  'trades',
  'token_market_state',
  'candles',
  'creator_credits',
  'creator_claimable_state',
] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

export function isRealtimeTable(name: string): name is RealtimeTable {
  return (REALTIME_TABLES as readonly string[]).includes(name);
}
