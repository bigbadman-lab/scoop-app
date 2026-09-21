# RHC integer overflow production recovery

## 1. Verdict

`PASS — RHC INDEXER HEALTH RESTORED`

## 2. UTC timestamp

2026-09-21T18:57:30Z

## 3. Original failure

```text
value "6767803800000000" is out of range for type integer
```

Observed on `scoop-app` (`srv-daenmj6q1p3s73a4long`) as:

```text
{"level":"error","message":"indexer:start failed","error":"value \"6767803800000000\" is out of range for type integer"}
```

Process crash-looped (`ready=false`) after collateral `main` redeploys.

## 4. Root cause

| Field | Value |
|-------|-------|
| Component | Canonical RHC indexer (`apps/indexer`) |
| Table | `trades` |
| Column | `fee` |
| Old type | `integer` (int32, max `2147483647`) |
| Value semantics | Pons `CurveBuy` / `CurveSell` event fee in **quote wei** (not UV4 fee tier) |
| Exact code path | `normalizePonsLaunch` / `processBlock` → `upsertTrade` binding `fee` into `trades.fee` |

Classification: **D** — wei-sized monetary fee written into a Uniswap fee-tier `integer` column.

The value `6767803800000000` fits JavaScript `Number.MAX_SAFE_INTEGER` (so prior clamps at that threshold did not fire) but overflows PostgreSQL `integer`.

Sibling `pools.fee` remains UV4 fee-tier `integer` and was not written with this wei value.

## 5. Fix

| Layer | Change |
|-------|--------|
| DB | `ALTER TABLE trades ALTER COLUMN fee TYPE bigint USING fee::bigint` |
| App | `TradeRow.fee` accepts `number \| bigint \| string`; `upsertTrade` uses `toNumericString(fee)` |
| Writers | Pass Pons `ev.args.fee` as `bigint` (removed int32/`Number` truncation paths) |

Why `bigint`: fee is either a small UV4 tier or a wei amount; `bigint` preserves both without loss. No downscaling.

## 6. Regression test

Exact value `6767803800000000`:

- `packages/db/src/repos/trades.fee-bigint.test.ts` — upsert params preserve exact decimal string
- `apps/indexer/src/live/pons-fee-bigint.test.ts` — proves JS safe-int still overflows PG int32; bigint string remains exact

Production proof after deploy:

```text
MAX(fee) = 6767803800000000
COUNT(fee > 2147483647) = 1
```

## 7. Files changed

| Path | Purpose |
|------|---------|
| `supabase/migrations/20260921193000_trades_fee_bigint.sql` | Widen `trades.fee` to bigint |
| `packages/db/src/repos/trades.ts` | Bind fee via `toNumericString` |
| `packages/db/src/repos/trades.fee-bigint.test.ts` | Upsert regression |
| `apps/indexer/src/live/normalizePonsLaunch.ts` | Pass wei fee as bigint |
| `apps/indexer/src/live/processBlock.ts` | Pass wei fee as bigint |
| `apps/indexer/src/live/pons-fee-bigint.test.ts` | Overflow regression |

## 8. Migration

| Field | Value |
|-------|-------|
| Filename | `supabase/migrations/20260921193000_trades_fee_bigint.sql` |
| SQL summary | `ALTER TABLE trades ALTER COLUMN fee TYPE bigint USING fee::bigint` |
| Production applied | YES (before deploy) |

## 9. Tests

```text
pnpm --filter @scoop/db test -- trades.fee-bigint     → PASS (suite green; focused file PASS)
pnpm exec vitest run src/live/pons-fee-bigint.test.ts → PASS (2)
pnpm --filter @scoop/db run build                     → PASS
pnpm --filter @scoop/indexer run typecheck            → PASS (on committed tree)
```

## 10. Deploy

| Field | Value |
|-------|-------|
| Commit SHA | `988eed2` |
| Render deploy ID | `dep-daonq0g473hc73f65oig` |
| Status | live @ 2026-09-21T18:56:07Z |

## 11. RHC health

| Field | Value |
|-------|-------|
| ready | YES — continuous catch-up batches, no crash loop |
| checkpoint | advancing (e.g. `68788309` stuck → `68863516+` within ~1m of live) |
| chain head | ~`69029394` |
| lag | decreasing via natural range catch-up (~1300 blocks/s); fixed-lag target preserved |
| confirmation mode | `fixed-lag` |
| confirm lag | `64` |
| errors after deploy | `out of range for type integer` count = **0** |

## 12. Data continuity

| Check | Result |
|-------|--------|
| gap found | NO (resume from existing checkpoint + 1; no rewind) |
| duplicates found | NO |
| bounded catch-up completed | IN PROGRESS (natural catch-up from stale checkpoint toward tip) |
| full replay performed | NO |

## 13. Solana worker collateral health

| Check | Result |
|-------|--------|
| Alchemy provider still active | YES |
| SCPY watchlist present | YES (mint count 1) |
| no PumpPortal | YES |
| service healthy | YES (`subscribed`; reconnect after collateral deploy recovered cleanly) |

## 14. Suspended workers

| Worker | State |
|--------|-------|
| news ingest (`scoop-news-ingest`) | suspended |
| fee-keeper (`scoop-fee-keeper`) | suspended |
| holder-rewards (`scoop-holder-rewards`) | suspended |

## 15. Production actions

| Action | Done? |
|--------|-------|
| DB reset | NO |
| checkpoint reset | NO |
| historical full replay | NO |
| protocol broadcast | NO |
| Solana code changed | NO |

## 16. Exact next step

`NEXT STEP: COMPLETE SOLANA VISUAL POLISH — PUMP METRICS ON HOMEPAGE/MARKETS, SOLANA.SVG BADGES, WHITE SOLANA CTA TEXT, AND SIGNED-OUT ACCOUNT CLEANUP.`
