# SCOOP — SOLANA TRADE USD VALUE + CANARY CLEANUP

## 1. Verdict

```text
PASS — SOLANA TRADE USD LIVE + CANARY REMOVED
```

---

## 2. UTC timestamp

`2026-09-22T15:00:30Z` (report finalize)

Gate window: trade-USD commit `0567fe3` → live USD on `scoop.fun` → canary-remove harden `c088602` → guarded cleanup ~14:58–15:00Z → post-checks `15:00:30Z`.

---

## 3. Trade USD root cause

Pump trades already carried SOL consideration through `pump_trades` → `getPumpTrades` → `/api/tokens/[address]/trades` → `TradeItem` → `TokenRecentTrades`.

USD was **hardcoded null** in the Pump mapper (`mapPumpTradeRow` / former `mapTradeRow` in `packages/db/src/queries/pump-market.ts`): `quoteUsdX18`, `executionPriceUsdX18`, `usdValueX18` / displays were always `null`. The trades API never called `getSolUsdX18()`, unlike token detail / markets overlay.

UI already rendered `formatTradeUsdValue` → `—` when null. No new provider; no browser CoinGecko.

---

## 4. SOL/USD source

| Item | Value |
|------|-------|
| Helper | `getSolUsdX18()` in `apps/web/src/lib/market/spot.ts` (desk CoinGecko cache) |
| Conversion | `notionalUsdX18FromQuoteAmount` + `priceUsdX18FromQuote` from `@scoop/shared` |
| Semantics | **Current SOL/USD spot** as display conversion — **not** trade-time / execution FX (Pump does not persist historical SOL/USD per trade) |
| Null behavior | If spot missing or ≤0 → USD fields stay `null` / UI `—`; never fabricate `$0` |
| Fetch cadence | Once per trades API request (not per row) |

---

## 5. Trade DTO

Reused existing `TradeItem` fields (no competing `tradeUsd*` names):

- `quoteUsdX18` — SOL/USD spot x18 (when available)
- `executionPriceUsdX18` / `executionPriceUsdDisplay` — unit price in USD
- `usdValueX18` / `usdValueDisplay` — trade notional USD

SOL remains on `quoteAmountRaw` / `quoteAmountDisplay` + `executionPriceQuote*`.

---

## 6. UI

| Check | Result |
|-------|--------|
| Buys show USD | **YES** |
| Sells show USD | **YES** |
| SOL remains | **YES** (quote column always visible for `marketSource=pump`; RHC still lg-gated) |
| Mobile | **PASS** (Pump quote not `hidden` on small viewports) |
| RHC unchanged | **YES** (shared component; RHC branch of trades API untouched; production RHC trades still return indexed USD e.g. SRVSTATE/ZHANG) |

Live SCPY sample (`https://scoop.fun`):

```text
sell  0.195555553 SOL  $22.82…
buy   0.097777777 SOL  $11.41…
```

---

## 7. Tests

```bash
pnpm --filter @scoop/db exec vitest run src/queries/pump-market.test.ts
# ✓ 14 tests

pnpm --filter @scoop/web exec vitest run \
  src/lib/token/recent-trades.test.ts \
  src/components/token/TokenRecentTrades.test.tsx
# ✓ 11 tests

pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/external-pump-canary-remove.test.ts
# ✓ 3 tests

pnpm --filter @scoop/db run build
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
# all exit 0
```

Covered: buy/sell SOL→USD, missing/zero spot → null, integer-safe x18, Pump row SOL+USD, RHC quote column still lg-gated, canary delete launches-before-pump_*.

---

## 8. Deploy

| Item | Value |
|------|-------|
| Trade USD SHA | `0567fe32b08da024d83e883cbca101945ae7352e` |
| Canary-remove harden SHA | `c0886029537a9e15d374825c6f9c6409fad5ebdf` (HEAD) |
| Vercel | Auto-deploy from `main` → `https://scoop.fun` |
| READY proof | Production `/api/tokens/B7ai…/trades?chainId=900001` returns non-null `usdValueDisplay` for buy+sell |

CLI harden does not require a frontend redeploy; worker restart was **not** required (settle wait sufficient).

---

## 9. Canary pre-cleanup footprint

Mint: `3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump`

| Surface | Pre |
|---------|-----|
| registry | canary @ `4vM2CmpH…Myh5DpQ`, imported `2026-09-22T14:28:34.339Z` |
| token / launch | true / true |
| watchlist | present |
| pump_market_state | true |
| pump_trades | 812 (grew to 831 by scrub) |
| pump_candles | 48→49 |
| pump_worker_checkpoints | true |
| scoop_support_buys | 0 |
| display_image_url | `…/token-image/manual/d710b52504b08209/…jpg` |
| NOT official / NOT protected | confirmed (`import_kind=canary`) |

---

## 10. Cleanup

Command:

```bash
pnpm official:canary-remove -- \
  --mint 3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump \
  --confirm "REMOVE EXTERNAL PUMP CANARY"
```

Worker / watchlist handling:

1. Phase 1 — `detachExternalPumpCanaryWatchlist` deleted **1** launch; DB watchlist **absent**
2. Wait **50s** for worker in-memory refresh (default refresh 45s)
3. Phase 2 — full `deleteExternalPumpCanaryMarket`
4. Wait **60s** — no reinsertion; orphan scrub **not** required

Deleted (phase 2):

| Table | Count |
|-------|------:|
| launches | 0 (already detached) |
| scoop_support_buys | 0 |
| pump_candles | 49 |
| pump_trades | 831 |
| pump_market_state | 1 |
| pump_worker_checkpoints | 1 |
| tokens | 1 |
| external_pump_import_canaries | 1 |

Image: DB refs removed; content-addressed Supabase object **retained** (shared/manual path).

---

## 11. 60-second verification

| Check | Result |
|-------|--------|
| pump-row reinsertion | **NONE** (trades/candles/state/checkpoints all 0) |
| mint absent from watchlist | **YES** (`getPumpWatchlistItem` null) |
| orphan scrub | skipped (not needed) |

---

## 12. Post-cleanup

| Check | Result |
|-------|--------|
| Token page | HTTP 200 friendly syncing page; title `Market syncing · SCOOP`; **no** Transfinance |
| `/api/tokens/<mint>?chainId=900001` | **404** |
| `/markets` API | canary **absent**; pump symbols `SCPY`, `NORELF` only |
| Homepage / discover | canary **absent** |
| DB rows | token/launch/registry/pump_* / support all **gone** |

---

## 13. Regression

| Check | Result |
|-------|--------|
| SCPY | Intact (`tokens.symbol=SCPY`; trades USD live) |
| Other Solana market | NORELF intact (`priceUsd` present) |
| RHC/Pons | Intact — 16 RHC launches; markets show MUSE etc.; ZHANG/SRVSTATE trades still carry USD |
| Worker healthy | Checkpoints remain for SCPY + NORELF only; canary mint absent |
| Unrelated data | Only the canary mint touched |

---

## 14. Production actions

```text
blockchain tx: NO
Streamflow: NO
official token config: NO
announcement: NO
support-wallet buy: NO
private key: NO
new provider: NO
```

---

## 15. Exact next step

```text
NEXT STEP: PROCEED TO THE REAL OFFICIAL $TAPE EXTERNAL-PUMP IMPORT + STREAMFLOW LOCK + OFFICIAL REGISTRATION + ANNOUNCEMENT SEQUENCE.
```
