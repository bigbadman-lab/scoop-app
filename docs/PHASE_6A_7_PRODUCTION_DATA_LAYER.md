# Phase 6A.7 — Production Data Layer

Product read path for SCOOP discovery, token detail, trades, holders, candles, rankings, creator earnings, and indexer health.

> **The frontend does not read raw blockchain events directly. The indexer/database layer is the canonical product data interface.**

## Scope

| In | Out |
| --- | --- |
| `@scoop/db` product DTOs + parameterized queries | News feed |
| Additive migration (indexes, views, RLS, realtime) | Final marketing UI |
| Next.js server API routes | Reown / wallet connect |
| Indexer singleton lock + migration check | Redis |
| Render worker blueprint + checklist | scoop-protocol changes |

Preserves HELLO `verify:hello` and 6A.6 live indexer behavior. `SCOOP_INDEXING_ENABLED` remains **false** by default.

## Architecture

```
Browser / clients
    │  NEXT_PUBLIC_SUPABASE_URL + ANON key (realtime on curated tables only)
    │  OR Next.js /api/* (server uses DATABASE_URL)
    ▼
apps/web server  ──►  @scoop/db queries  ──►  Postgres projections
                                                    ▲
apps/indexer (Render worker) ── writes ─────────────┘
```

- **Never** expose `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or RPC URLs to the browser.
- Server routes set `dynamic = 'force-dynamic'` and validate address / interval / limit (max 100).

## DTOs (`packages/db/src/dto.ts`)

- `TokenDiscoveryItem`, `TokenDetail` — include derived `isNew` / `isSoon` / `isBonded`
- `TradeItem` — includes `traderAttributionType`; `txFrom` is **not** guaranteed identity
- `HolderItem` — `percentOfSupplyBps` and `percentOfSupplyX18` (bigint math, no float)
- `CandleItem`, `CreatorEarningsSummary`, `DiscoveryRankingItem`, `IndexerStatus`

Raw amounts stay decimal **strings**. Display strings use string-decimal helpers (`formatRawAmount` / `formatX18`).

## Queries

| Function | Notes |
| --- | --- |
| `getTokens` | filter `all\|new\|soon\|bonded`, sort, limit/offset |
| `getToken` | chainId + address |
| `getTrades` | pagination + optional side; confirmation via left join `raw_chain_events` |
| `getHolders` | optional `retailOnly` |
| `getCandles` | intervals `1m\|5m\|15m\|1h\|4h\|1d` |
| `getCreatorEarnings` | claimable + credited/claimed aggregates |
| `getRankings` | volume24h, fdv, gainers, losers, mostTraded, mostHolders, newest, soon, bonded |
| `getIndexerStatus` | heartbeat / lag / healthy flag |

## Migration

`supabase/migrations/20260906160000_phase_6a7_data_layer.sql`

1. Performance indexes for discovery sorts, trades pagination, holders, candles, creator earnings
2. Views: `public_token_discovery`, `public_token_detail`, `public_indexer_health`
3. RLS enabled on product + ingest tables; `GRANT SELECT` on views/curated tables to `anon`/`authenticated` (exception-wrapped for local Postgres); **no** anon access to `raw_chain_events`, `indexer_checkpoints`, `processed_blocks`
4. `ALTER PUBLICATION supabase_realtime ADD TABLE` for launches, trades, token_market_state, candles, creator_credits, creator_claimable_state (no-op when publication missing)

## Web API

| Route | Purpose |
| --- | --- |
| `GET /api/tokens` | Discovery list |
| `GET /api/tokens/[address]` | Token detail |
| `GET /api/tokens/[address]/trades` | Trades |
| `GET /api/tokens/[address]/holders` | Holders |
| `GET /api/tokens/[address]/candles` | Candles (`interval` query) |
| `GET /api/creators/[creatorId]/earnings` | Creator earnings |
| `GET /api/rankings` | Rankings (`type` query) |
| `GET /api/indexer/health` | Indexer status |

Client realtime allowlist stub: `apps/web/src/lib/realtime/tables.ts`.

## Indexer guardrails

- `pg_try_advisory_lock(hashtext('scoop_indexer'))` on a dedicated session; release on exit
- Startup check: `token_market_state.launch_progress_bps` must exist
- SIGTERM/SIGINT finish the **current batch**, then unlock + exit
- Lock failure → clear error, non-zero exit

## Render

- `render.yaml` — Docker worker from `docker/indexer.Dockerfile`
- Staged enablement: `docs/RENDER_INDEXER_CHECKLIST.md`

## HELLO fixture (lowercase in DB)

| Field | Value |
| --- | --- |
| token | `0x2284ed0e4d446c6d78ac2d49a68bae822fd87373` |
| pool | `0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc` |
| creatorId | `0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef` |
| creator | `0x35affbccc92add3fab6b515326da1433dca7cf9c` |
| name / symbol | Hello World / HELLO |

## Tests

- `packages/db` unit tests: decimal helpers, pagination clamps, mocked `Queryable` SQL mapping
- Optional live HELLO acceptance when `DATABASE_URL` is set (loads `.env.local`, otherwise skips)
- `apps/web` route tests: validation errors + secret non-leakage (mocked query layer)
- `apps/indexer` guardrails unit tests

## Security reminders

- Browser: anon / publishable key only
- Server / indexer: `DATABASE_URL` (and optional service role) only on the server
- Product reads go through views, curated tables, or `@scoop/db` — not raw chain event dumps
