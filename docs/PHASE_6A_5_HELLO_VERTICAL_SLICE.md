# Phase 6A.5 — HELLO Vertical Slice

One-shot indexing of the HELLO launch on Robinhood Chain (block `55863290`) into Postgres.

## Scope

- Schema migration under `supabase/migrations/`
- `@scoop/db` pg client + upsert repos (server/indexer only; no browser Supabase writes)
- `@scoop/shared` HELLO fixture + integer-safe price / classification helpers
- `@scoop/indexer` HELLO decode → hydrate → normalize → backfill / verify / reset
- Live indexing remains **disabled** (`SCOOP_INDEXING_ENABLED=false`)

## Migration

`supabase/migrations/20260906140000_phase_6a5_hello_schema.sql`

Tables: `chains`, `protocol_contracts`, `quote_assets`, `address_classifications`, `raw_chain_events`, `indexer_checkpoints`, `launches`, `tokens`, `creators`, `pools`, `trades`, `transfers`, `holder_balances`, `token_market_state`, `candles`, `fee_distributions`, `creator_credits`, `creator_claims`, `creator_claimable_state`, `quote_price_snapshots`, `indexer_health`.

Seeds (idempotent): chain 4663, production contracts, native ETH quote + oracle feed, system address classifications.

Amounts: `NUMERIC(78,0)`. Addresses/hashes: lowercase `0x` hex.

## Commands

```bash
pnpm db:migrate          # apply supabase/migrations/*.sql (filenames only; no URLs)
pnpm backfill:hello      # block 55863290 + HELLO tx only
pnpm verify:hello        # golden PASS/FAIL
pnpm reset:hello         # requires SCOOP_ALLOW_HELLO_RESET=true
```

## HELLO block / tx

| Field | Value |
| --- | --- |
| Chain | `4663` |
| Block | `55863290` |
| Tx | `0xbb4e2f633b3ffb96c0786c9e0b7e096383be3b6472c8e6aec42264f5620d0fe7` |
| Token | `0x2284ed0e4d446c6d78ac2d49a68bae822fd87373` |

## Event flow

Receipt decoded in log order: Factory (`LaunchFeePaid`, `ScoopTokenCreated`, `TokenLaunched`, `InitialBuyExecuted`) → CreatorRewards `SourceRegistered` → PoolManager `Initialize`/`Swap` → ERC-20 `Transfer`s. Two-pass normalize: raw events first, then entities/projections.

## Trade / attribution

- `swap_sender` = UniversalRouter
- `tx_from` / `trader_address` = creator
- `trader_attribution_type` = `tx_from` (not guaranteed end-user identity)
- `side` = `buy`, `is_initial_buy` = true
- `amount0_raw` < 0, `amount1_raw` > 0
- USD fields left **NULL** (no current ETH/USD backfill)

## Idempotency / reset

Re-running `backfill:hello` upserts on natural keys — row counts stay stable.  
`reset:hello` deletes only HELLO-scoped rows when `SCOOP_ALLOW_HELLO_RESET=true`. Never truncates whole tables.

## Permissions

Indexer writes via `DATABASE_URL` (service role / Postgres). No anon write grants. Public RLS/views deferred to web integration.

## Next — 6A.6

Continuous / multi-token indexing, confirmations, reorg handling, and broader projections — still gated by `SCOOP_INDEXING_ENABLED`.
