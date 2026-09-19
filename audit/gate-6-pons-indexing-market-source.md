# Gate 6 — Pons V2 Indexing + Market-Source Compatibility

## 1. Verdict

`PASS — PONS MARKET-SOURCE INDEXING READY; PUBLIC CUTOVER STILL OFF`

## 2. UTC timestamp

`2026-09-19T17:44:53Z`

## 3. Git state

| Field | Value |
|---|---|
| Branch | `main` |
| Pre-HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Final HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` (no commit) |
| Dirty state | Preserved |
| Production DB migration run | **NO** (migration created only) |
| Production broadcasts | **None** |

### Files created

- `supabase/migrations/20260919180000_gate6_pons_market_source.sql`
- `packages/shared/src/marketSource.ts` (+ test)
- `apps/indexer/src/live/decodePons.ts` (+ test)
- `apps/indexer/src/live/hydratePons.ts`
- `apps/indexer/src/live/normalizePonsLaunch.ts`
- `packages/db/src/queries/market-source.test.ts`
- `apps/web/src/lib/trade/market-source-guard.ts` (+ test)
- `audit/gate-6-pons-indexing-market-source.md`

### Files modified (high level)

- `packages/db` — `LaunchRow` / `upsertLaunch`, DTOs, discovery SQL, `getLaunchMarketReady`, live tip merge
- `packages/contracts` — add `CurveSell` to `ponsV2CurveEventsAbi`
- `apps/indexer` — `processBlock` dual-source routing, `watchlist` Pons curves, Scoop `normalizeLaunch` sets `market_source=scoop`
- `apps/web` — trade guard, token page source-aware UI, launch snapshot nullability, isolation still Scoop `/launch`

## 4. Source-discriminator design

**Chosen:** explicit `launches.market_source` (`scoop` | `pons_v2`).

**Why not factory_address alone:** factory comparisons would scatter fragile address logic across API/UI/workers. An explicit column is durable, backfill-safe (`DEFAULT 'scoop'`), and cheap to surface as `marketSource` on DTOs.

Also stored:

- `curve_address`, `launch_config_id`, `graduation_threshold_raw`, `graduation_status` (`curve` | `graduated`)
- Public `marketPhase` = `curve` | `graduated_pool` | `null` (null for Scoop)

## 5. DB migration

`supabase/migrations/20260919180000_gate6_pons_market_source.sql`

- Add `market_source NOT NULL DEFAULT 'scoop'` + check constraint
- Add Pons columns (nullable)
- Make UV4-at-launch columns nullable (`pool_id`, fee distributor, locker, ticks, sqrt, lp token)
- Replace UNIQUE constraints with **partial unique indexes** (`WHERE … IS NOT NULL`) so multiple Pons nulls are allowed
- Backfill: `UPDATE … SET market_source = 'scoop'`

**Not run against production.**

## 6. Indexer routing

```text
processBlock
  → ScoopFactory TokenLaunched → hydrateLaunchView → normalizeLaunch (market_source=scoop)
  → Pons Factory TokenLaunched → hydratePonsTokenMetadata → normalizePonsLaunch (market_source=pons_v2)
  → PoolManager Swap (Scoop watchlist pools)
  → CurveBuy / CurveSell (Pons watchlist curves)
  → CurveBuyRefunded → raw event only (no volume)
```

Source determined by **emitting contract address + event topic**, never token metadata.

## 7. Pons normalization

Persisted honestly:

| Field | Value |
|---|---|
| `market_source` | `pons_v2` |
| `factory_address` | Pons Factory |
| `token_address` / `curve_address` / `deployer` | from `TokenLaunched` |
| `quote_asset` | `pairToken` |
| `launch_config_id` / `graduation_threshold_raw` | from event |
| `graduation_status` | `curve` |
| UV4 pool / fee distributor / locker / ticks | **NULL** (not invented) |
| `token_market_state` | counters + optional quote-implied price; **FDV/USD null** |

Synthetic `pool_id` used only inside `trades` / `token_market_state` for reuse (`curveSyntheticPoolId`) — not exposed as a real UV4 pool on the launch row.

## 8. Curve activity indexing

- `CurveBuy` → trade `side=buy`, `quote_amount_raw=quoteIn`, `token_amount_raw=tokensOut`
- `CurveSell` → trade `side=sell`, `quote_amount_raw=quoteOut`, `token_amount_raw=tokensIn`
- `execution_price_quote_x18 = quote * 1e18 / tokens` (integer)
- `CurveBuyRefunded` → raw event only; **does not inflate volume**
- Not classified as Uniswap `Swap`

## 9. Price / FDV / volume semantics

| Metric | Scoop | Pons curve (now) |
|---|---|---|
| Quote volume / trade counts | Yes | Yes (from curve trades) |
| Implied quote price from last trade | Yes (UV4) | Optional quote price only |
| USD price / FDV / USD volume | Yes | **Withheld** (null in DTO mapping) |
| UV4 sqrt / tick / liquidity | Yes | Stored as zeros in market_state; not exposed as pool key |

Accuracy over fake cards.

## 10. Graduation model

- `graduation_status = curve` at launch
- `graduated` reserved for later indexing
- `launches.pool_id` remains null until a real graduated pool is indexed
- Do not mark new Pons launches as UV4 pools

## 11. API / DTO changes

`TokenDiscoveryItem` / `TokenDetail` / `LaunchMarketReady` expose:

- `marketSource`
- `marketPhase`
- `curveAddress`
- `poolId` nullable
- Scoop fee distributor / locker nullable on detail

`GET /api/launches/by-token` returns Pons rows as ready **without** UV4 pool.

## 12. Token-page compatibility

- Shows Source = `Pons V2` / `SCOOP`
- Curve address instead of Pool for Pons
- Hides Scoop trading-fee / creator-share / buyback panel for `pons_v2`
- Identity, age, holders, trades list remain available when indexed

## 13. Markets / home compatibility

- Discovery SELECT includes Pons rows
- Nullable pool fields do not crash mapping
- Misleading FDV/USD withheld for Pons

## 14. Trading safety

`canUseScoopUv4TradePath` — **Pons markets always false**.

`TokenBuySell` shows: “Trading integration for this Pons market is not enabled yet.” and never loads Scoop UV4 swap UI.

**Confirmed: Pons curve markets cannot invoke legacy Scoop swap flow.**

## 15. Legacy rewards / fees safety

- Scoop fee panel gated off for `pons_v2` on token page
- Holder rewards / claims remain account+env gated and Scoop-vault based (unchanged; not shown as Pons features)
- Fee-keeper continues to operate on Scoop launches only (UV4 watchlist filter)

## 16. Tests

| Test area | Result |
|---|---:|
| shared `marketSource` | PASS (5) |
| db discovery + by-token readiness | PASS (3) |
| indexer `decodePons` + price helper | PASS (6) |
| web trade guard | PASS (4) |
| token page Pons gating | PASS (1 added; shell suite green) |
| `/launch` isolation | PASS (3) |
| packages typecheck (contracts/shared/db/indexer/web) | PASS |

**Gate 6 focused runs:** 5+3+6+4+14 TokenMarketShell + 3 isolation ≈ **35+** passed in verification; broader suites not fully re-run.

## 17. Production migration status

| Status | |
|---|---|
| Created | YES |
| Run locally/test | NO (not executed in this gate) |
| Run production | **NO** |

Operator must apply `20260919180000_gate6_pons_market_source.sql` via normal migrate process before live Pons indexing.

## 18. Known gaps

- Public `/launch` still legacy Scoop
- Pons trading not implemented
- Graduation event indexing not implemented
- Accurate curve FDV/USD deferred
- `$TAPE` still surfaced; orange theme still active
- No production canary

## 19. Gate 7 recommendation

Public launch wizard cutover:

- Pons orchestrator + HoodLock
- Pons indexed-readiness (`market_source=pons_v2`)
- Remove Scoop launch controls from public creator flow
- Preserve legacy Scoop read/trade for old markets
- No `$TAPE`/theme work unless deliberately combined

## 20. Explicit no-broadcast confirmation

- Pons launch broadcast: **NO**
- approval broadcast: **NO**
- HoodLock lock broadcast: **NO**
- production DB migration run: **NO**
- deployment: **NO**
- env mutation: **NO**
