# Solana holder count via Alchemy

## 1. Verdict

`PASS — SOLANA HOLDER COUNTS LIVE VIA ALCHEMY`

## 2. UTC timestamp

2026-09-21T21:43:10Z

## 3. Root cause

Solana holders previously showed `—` because:

1. `pump_market_state` had no holder columns.
2. The Solana worker never enumerated token accounts.
3. Pump overlay never mapped holders into shared `holderCountAll` / `holderCountRetail`.
4. `TokenMarketLiveView` forced Pump holders to `null`.

## 4. Holder definition

`unique owner wallets with aggregate token balance > 0`

Protocol-owned exclusions: **none** (none required by existing SCOOP rules). Bonding-curve / program accounts, if present with positive balance, are counted.

## 5. Alchemy method

| Item | Value |
|------|-------|
| Method | `getTokenAccounts` (Alchemy DAS) |
| Params shape | bare object (`mintAddress`, `limit`, `cursor`, `options.showZeroBalance`) — **not** a JSON-RPC array |
| Pagination | response `cursor`; empty page or null cursor terminates |
| Amount field | `amount` (integer / decimal string → `bigint`) |
| Owner field | `owner` (exact base58) |
| Zero balances | included when `showZeroBalance: true`; zero aggregate owners excluded from count |

API key never logged.

## 6. Live SCPY enumeration

Mint: `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

| Metric | Value |
|--------|-------|
| total token accounts | 4 |
| positive token accounts | 1 |
| unique positive owners | 1 |
| persisted `holder_count` | 1 |

Price/volume unchanged after holder write (`price_sol` / `volume_24h_sol` / `trade_count_24h` preserved).

## 7. Pagination

- Pages fetched for SCPY: **2** (page 1 with cursor + empty final page)
- Termination: empty `token_accounts` **or** missing `cursor`; repeated cursor throws
- Duplicate owners across pages: aggregated via `Map<owner, bigint>`

## 8. Refresh model

| Item | Value |
|------|-------|
| Cadence | `SCOOP_SOLANA_PUMP_HOLDER_REFRESH_MS` default **180000** (3 min); first cycle ~15s after start |
| Watchlist | `listPumpWatchlist` / in-memory `watchByMint` |
| Concurrency | sequential per mint |
| Error behavior | log + skip DB write; prior count retained |
| Trade ingest | independent loop — unchanged |

## 9. Persistence

| Item | Value |
|------|-------|
| Table | `pump_market_state` |
| Field | `holder_count` (`bigint` nullable) + `holders_updated_at` |
| Migration | `supabase/migrations/20260921220000_pump_market_state_holder_count.sql` (applied to production) |
| Update fn | `updatePumpHolderCount` — holder fields only; trade refresh does not touch `holder_count` |

## 10. APIs / DTOs

| Surface | Behavior |
|---------|----------|
| Shared fields | `holderCountAll` / `holderCountRetail` (both set to unique-owner count) |
| Token detail | `applyPumpMarketStateToTokenDetail` maps holders even if `price_sol` is null |
| `/api/tokens/[address]/holders` | Solana still `{ items: [], deferred: true }` — aggregate count is on token/markets DTOs, not a full holder directory |

## 11. UI

### Token page

- SCPY holder count visible: YES (after web deploy; DTO maps `1`)
- displayed count: `1`

### `/markets`

- SCPY holder count visible: YES (via dual-rail overlay → shared fields)
- Holder sort includes Solana: YES (numeric; nulls last)

### Homepage

- holder count displayed: YES (existing `TokenDiscoveryItem` meta line when count present)

## 12. RHC regression

Pre-deploy TMS samples (unchanged by this gate):

| Token | holder_count_all | holder_count_retail | unchanged |
|-------|------------------|---------------------|-----------|
| `0x5d7493…8392` | 106 | 104 | YES (no RHC writes) |
| `0x7c6b53…cbc5` | 12 | 10 | YES |

## 13. Tests

```text
pnpm --filter @scoop/db exec vitest run src/repos/pump-market-state.test.ts src/queries/pump-market.test.ts
→ 12 passed

pnpm --filter @scoop/solana-pump-worker test
→ 38 passed

pnpm --filter @scoop/web exec vitest run src/components/token/TokenMarketShell.test.tsx
→ 16 passed

pnpm --filter @scoop/db run build → ok
pnpm --filter @scoop/web run typecheck → ok
pnpm --filter @scoop/web run build → ok
```

## 14. Files changed

- `supabase/migrations/20260921220000_pump_market_state_holder_count.sql`
- `packages/db/src/repos/pump-market-state.ts` (+ test)
- `packages/db/src/queries/pump-market.ts` (+ test)
- `packages/db/src/index.ts`
- `apps/solana-pump-worker/src/provider/alchemy-rpc.ts` — object params for DAS
- `apps/solana-pump-worker/src/holders/*` — fetch + refresh + tests
- `apps/solana-pump-worker/src/config.ts` / `run.ts`
- `apps/web/src/components/token/TokenMarketLiveView.tsx`
- `apps/web/src/components/token/TokenMarketShell.test.tsx`
- `audit/solana-holder-count-alchemy.md`

## 15. Deployment

- SHA: `0101034`
- Render deploy ID: `dep-daoqap942hec73fomao0` (`scoop-solana-pump-worker`)
- Render status: build_in_progress at push; confirm live after Ready
- Vercel: GitHub auto-deploy for web UI/DTO changes on `main`
- Vercel status: confirm production Ready for `0101034`

## 16. Production actions

```text
new provider added: NO
SOLANA_RPC_URL changed: NO
Alchemy trade ingestion changed: NO
Pump decoder changed: NO
RHC indexer changed: NO
PONS changed: NO
launch flow changed: NO
news worker started: NO
fee keeper started: NO
holder rewards started: NO
```

## 17. Exact next step

`NEXT STEP: RETURN TO THE NEWS ROUTING + PUMP LORE + SOLANA DEV BUY GATE, THEN RUN THE FINAL NEWS-ASSISTED SOLANA CANARY.`
