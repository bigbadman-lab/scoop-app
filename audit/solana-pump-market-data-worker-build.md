# SCOOP — Solana Phase 5: Minimal Pump Market-Data Worker Build

## 1. Verdict

`BLOCKED — SOLANA/PUMP WORKER NOT READY`

Primary blocker:

`BLOCKED — LIVE PUMP TRADE SOURCE NOT YET LOCKED`

Phase 4 architecture audit report `audit/solana-pump-market-data-worker-architecture.md` is **absent**. No prior audit locks PumpPortal, Helius, Bitquery, or Solana RPC log subscriptions as the production live trade feed. Per phase rules, this build stops at the **provider interface + mock provider** and does **not** invent an external API contract.

Scaffolding below is implemented and locally tested so a locked source can be plugged in without redoing schema/API/UI.

UTC: `2026-09-21T10:38:21Z` · HEAD: `27cfde9`

---

## 2. Architecture implemented

```
SCOOP launches (chain_id=900001, market_source=pump)
  → listPumpWatchlist / getPumpWatchlistItem
  → apps/solana-pump-worker (flag-gated)
  → PumpTradeProvider adapter (mock only)
  → ingestNormalizedPumpTrade (idempotent)
  → pump_trades / pump_candles / pump_market_state / pump_worker_checkpoints
  → /api/tokens/* dual-rail (base58 + chainId=900001)
  → Token page native poll + chart/trades (SOL quote; Pump.fun CTA retained)
```

RHC indexer (`apps/indexer`) is untouched.

---

## 3. Live data source/provider

| Item | Status |
|------|--------|
| Source selected | **NONE (not locked)** |
| Why | Phase 4 architecture audit not present / no locked recommendation |
| Implemented provider | `MockPumpTradeProvider` only (`SCOOP_SOLANA_PUMP_TRADE_PROVIDER=mock`) |
| RPC/API key required for mock | **No** |
| Future live provider | Requires Phase 4 lock before implementation |

---

## 4. DB schema

Local migration only:

`supabase/migrations/20260921120000_solana_pump_market_data.sql`

| Table | Identity / notes |
|-------|------------------|
| `pump_trades` | PK `(chain_id, signature, event_index)`; `CHECK chain_id=900001` |
| `pump_candles` | PK `(chain_id, mint, interval, bucket_start)`; intervals `1m`/`5m`/`1h` |
| `pump_market_state` | PK `(chain_id, mint)`; price/FDV/24h stats |
| `pump_worker_checkpoints` | PK `(chain_id, mint)`; last signature/slot/cursor |

**Rollback notes:**

```sql
DROP TABLE IF EXISTS pump_worker_checkpoints;
DROP TABLE IF EXISTS pump_candles;
DROP TABLE IF EXISTS pump_trades;
DROP TABLE IF EXISTS pump_market_state;
```

No RHC table alterations. **Production apply: NO.**

---

## 5. Worker app

| Item | Value |
|------|-------|
| Package | `@scoop/solana-pump-worker` → `apps/solana-pump-worker` |
| Entrypoint | `apps/solana-pump-worker/src/index.ts` |
| Flag | `SCOOP_SOLANA_PUMP_INDEXING_ENABLED` default **`false`** |
| Disabled behavior | Idle heartbeat; **zero** RPC/provider/DB calls |
| Watchlist | Reloads from DB every ~45s; SCOOP Pump launches only |
| Scripts | `pnpm solana-pump-worker:dev` / `:start` |

---

## 6. Trade normalization

`NormalizedPumpTradeEvent` → `upsertPumpTrade` with fields: mint, signature, eventIndex, slot, blockTime, side, wallet, token/SOL amounts, priceSol, source=`pump`, curveAddress.

Duplicates: `ON CONFLICT DO NOTHING` → no candle/volume double-count.

---

## 7. Price / FDV

- Price = latest valid trade `price_sol` (no invented curve math).
- FDV = `price_sol × (total_supply_raw / 10^decimals)` when supply present; else **null**.
- USD fields left null (no SOL/USD path wired).

---

## 8. Candles

Built from normalized trades only (`1m`, `5m`, `1h`). First trade creates bucket; later trades update H/L/C + volumes + count. Duplicates skip candle apply.

---

## 9. 24h state

`refreshPumpMarketStateFromTrades` recomputes volume/counts from `pump_trades` where `block_time >= now() - 24h` (indexed mint+time). No unbounded history scan.

---

## 10. Resume model

`pump_worker_checkpoints` stores last signature / slot / provider cursor per mint. Advance only after successful persistence. Mock path has no historical Solana scan. Live bounded replay deferred until source lock.

---

## 11. API changes

Dual-rail `parseTokenApiAddress(raw, chainId)`:

- `chainId=900001` → base58 mint (no EVM lowercasing)
- else → existing `0x` parse

Routes branch on `SOLANA_MAINNET_CHAIN_ID`:

| Route | Pump path |
|-------|-----------|
| `GET /api/tokens/[address]` | `getToken` + `getTokenWithPumpMarketState` |
| `.../trades` | `getPumpTrades` |
| `.../candles` | `getPumpCandles` (`1m`/`5m`/`1h`) |
| `.../holders` | empty + `deferred: true` (no 500) |

RHC live overlay merge unchanged for non-Solana chainIds.

---

## 12. UI changes

- `TokenMarketLiveProvider` polls Pump with `chainId` from token seed (no longer skips).
- Chart + recent trades render natively; empty → “Waiting for trades” + Pump.fun link.
- Quote display remains SOL; Buy/Sell stays **external Pump.fun** (`marketSource=pump`).
- Holder metric shows `—` for Pump (deferred).

---

## 13. Holder strategy

**Pump holder count: deferred**

No `getProgramAccounts` / SPL holder scans in MVP.

---

## 14. Env requirements

| Var | Default / note |
|-----|----------------|
| `SCOOP_SOLANA_PUMP_INDEXING_ENABLED` | `false` |
| `SCOOP_SOLANA_PUMP_TRADE_PROVIDER` | `mock` only (others rejected) |
| `DATABASE_URL` | Required only when enabled |
| `SCOOP_SOLANA_PUMP_WATCHLIST_REFRESH_MS` | `45000` |
| Reconnect backoff envs | Present for future live provider |

- Future Render worker need `SOLANA_RPC_URL`? **Unknown until live source locked** (mock: no).
- Other provider keys? **Unknown / none for mock.**
- Production flag default? **`false`.**
- Never use `NEXT_PUBLIC_SOLANA_RPC_URL` for the worker.

---

## 15. Tests

| Suite | Command | Result |
|-------|---------|--------|
| `@scoop/db` | `pnpm --filter @scoop/db test` | **126 passed** (incl. pump watchlist + market helpers) |
| `@scoop/solana-pump-worker` | `pnpm --filter @scoop/solana-pump-worker test` | **15 passed** |
| web validate | `vitest run src/lib/server/validate.test.ts` | **3 passed** |

Coverage includes: disabled safety, watchlist filter, base58, ingest buy/sell/dup/malformed/out-of-order, candles intervals via ingest mocks, resume checkpoint calls, local simulation watchlist=1.

---

## 16. Typechecks / builds

| Target | Result |
|--------|--------|
| `@scoop/db` build | PASS |
| `@scoop/solana-pump-worker` typecheck + build | PASS |
| `@scoop/web` full typecheck | Environment noise (Next decls); Pump BigInt literal issue fixed |

---

## 17. Local simulation result

Simulation test (`src/simulation.test.ts`):

1. Seed mock watchlist size **1**
2. Ingest buy + sell
3. Duplicate buy skipped
4. Candles/state/checkpoint paths invoked for inserts
5. Health: received=3, persisted=2, duplicates=1

No live production RPC.

---

## 18. Regression check

| Area | Status |
|------|--------|
| RHC indexer runtime | **Unchanged** |
| RHC APIs (non-900001) | **Preserved** (same parse + overlay path) |
| News | **Unchanged** |
| Fee / holder-rewards workers | **Unchanged** |
| Vercel Solana launch flow | **Unchanged** |

Note: `packages/db/src/repos/live-overlay.ts` was already dirty on branch (RHC `clearLiveObserverCheckpoint`); not part of this Pump worker build.

---

## 19. Production actions

| Action | Performed? |
|--------|------------|
| Migration applied in production | **NO** |
| Render service created | **NO** |
| Worker enabled | **NO** |
| Env configured | **NO** |
| Solana transaction | **NO** |
| Production DB mutation | **NO** |

---

## 20. PASS/BLOCKED matrix

| Gate | Status | Reason |
|------|--------|--------|
| Isolated worker boundary | PASS | `apps/solana-pump-worker` separate from indexer |
| Scoop-only Pump watchlist | PASS | `900001` + `market_source='pump'` |
| No global Solana scan | PASS | Watchlist + mock only |
| Idempotent trades | PASS | Unique key + DO NOTHING |
| Native price available | PARTIAL | Schema/API/UI ready; needs live trades |
| Native candles available | PARTIAL | Same |
| 24h stats available | PARTIAL | Same |
| Bounded restart/replay | PASS (scaffold) | Checkpoints; no unbounded scan |
| Pump API supports base58 | PASS | Dual-rail routes |
| Pump token page supports native data | PASS | Poll + chart/trades + empty state |
| RHC path unchanged | PASS | Branched by chainId |
| Production default disabled | PASS | Flag default false |
| Live trade source locked | **BLOCKED** | Phase 4 audit missing / not locked |
| No production mutation | **NO** | Must remain no |

---

## 21. Exact next step

`NEXT STEP: COMPLETE PHASE 4 ARCHITECTURE AUDIT TO LOCK THE LIVE PUMP TRADE SOURCE, THEN IMPLEMENT THAT PROVIDER BEHIND THE EXISTING ADAPTER; ONLY THEN DEPLOY DB MIGRATION + CREATE DISABLED RENDER SOLANA/PUMP WORKER.`

Do **not** deploy or enable until the live source is locked and a real provider is implemented (mock is not a production feed).
