# Solana USD via CoinGecko + cross-chain ranking

## 1. Verdict

`PASS — SOLANA USD METRICS + CROSS-CHAIN RANKING LIVE`

## 2. UTC timestamp

2026-09-21T19:48:31Z

## 3. SOL/USD source

| Item | Detail |
|------|--------|
| Path | `apps/web/src/lib/market/spot.ts` |
| Change | Same CoinGecko `simple/price` request now includes `solana` alongside `ethereum,bitcoin` |
| Helper | `getSolUsdX18()` → bigint x18 via `usdNumberToX18` (fixed-decimal string path; never fabricates 0) |
| Cache | Existing `next: { revalidate: 20 }` on the shared fetch |
| Desk UI | Unchanged (still ETH/BTC/SPX/FTSE only) |
| Deploy note | First push (`3f7e724`) stalled because `build:packages` compiled `@scoop/db` before `@scoop/shared`; fixed in `ce1ea8d` |

SOL/USD during verification: **~$118.21** (CoinGecko at verify time; API used contemporaneous rate → FDV ≈ `$3325`).

## 4. SCPY native metrics

Mint: `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

| Field | Value |
|-------|-------|
| price SOL | `0.00000002` display (`priceQuoteDisplay`; full x18 from `0.000000028141244551`) |
| fdv SOL | `28.14124455` |
| volume SOL | `4.630255521` |
| trades | `11` |

## 5. SCPY USD metrics

Formulas: `priceUsdX18FromQuote` / `notionalUsdX18FromQuoteAmount` (shared x18).

| Field | Value |
|-------|-------|
| price USD | `0.00000332` |
| FDV USD | `3325.16945614` |
| volume USD | `547.11099236` |
| `priceUsdX18` | `3325169456146` |
| `fdvUsdX18` | `3325169456146160000000` |
| `volume24hUsdX18` | `547110992361360000000` |

Consistency: `28.14124455 × ~118.2 ≈ 3325` ✓

## 6. Homepage

- **New:** RHC + Solana blended; SCPY first by launch time
- **Trending:** SCPY included (`trending_n=1`, marketSource `pump`) — meets ≥3 trades + USD volume > 0
- **Bonding:** RHC-only (unchanged)
- Solana badge intact

## 7. Markets

- SCPY **rank 10 / 13** (was 13/13 under null USD FDV)
- `fdvUsdX18` populated; ranks with RHC on real USD FDV
- RHC controls still ~$5.9–6.0k FDV (FORGE/MUSE)
- Trades sort still uses Pump 24h count
- Holders remain `—` for Solana

## 8. RHC controls

| Symbol | FDV USD (live) |
|--------|----------------|
| FORGE | `5985.33314055` |
| MUSE | `5959.56979224` |
| SRVSTATE | `5707.08125299` |

RHC does not route through SOL/USD. Values remain oracle/TMS-derived.

## 9. Tests

```bash
pnpm --filter @scoop/db run build
pnpm --filter @scoop/db exec vitest run src/queries/pump-market.test.ts
pnpm --filter @scoop/web exec vitest run \
  src/lib/market/spot.test.ts \
  src/lib/discovery/dual-rail.test.ts \
  src/components/token/TokenMarketShell.test.tsx \
  src/components/markets/MarketsBoard.test.tsx
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
```

Results: PASS.

## 10. Files changed

| File | Purpose |
|------|---------|
| `apps/web/src/lib/market/spot.ts` | CoinGecko + SOL; `getSolUsdX18` |
| `apps/web/src/lib/market/spot.test.ts` | SOL fetch / null safety |
| `packages/db/src/queries/pump-market.ts` | USD overlay via shared x18 helpers |
| `packages/db/src/queries/pump-market.test.ts` | Conversion precision tests |
| `packages/db/package.json` + lockfile | `@scoop/shared` dependency |
| `package.json` | Build shared before db |
| `apps/web/src/lib/discovery/dual-rail.ts` | SOL/USD + Trending merge |
| `apps/web/src/lib/discovery/dual-rail.test.ts` | Trending eligibility |
| `apps/web/src/lib/token/load-token-page.ts` | Pass `solUsdX18` |
| `apps/web/src/app/api/tokens/[address]/route.ts` | Pass `solUsdX18` |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Prefer USD FDV when present |
| `audit/solana-usd-coingecko-crosschain-ranking.md` | This report |

## 11. Deploy

- SHA: `ce1ea8d` (build-order fix) on top of `3f7e724` (feature)
- Vercel: `https://scoop.fun` auto-deploy
- status: READY

## 12. Production verification

### Homepage
- blended: YES
- SCPY visible: YES
- USD price correct: YES
- USD FDV correct: YES
- Trending includes Solana: YES

### Markets
- blended: YES
- SCPY visible: YES
- USD FDV populated: YES
- FDV ranking works: YES (rank 10/13 by ~$3325 FDV)

## 13. Production actions

- Solana worker changed: NO
- Alchemy changed: NO
- RHC indexer changed: NO
- DB schema changed: NO
- launch flow changed: NO
- new provider added: NO (CoinGecko desk path extended only)

## 14. Exact next step

`NEXT STEP: RUN THE PONS POST-LAUNCH IMAGE + FDV/USD REPAIR FOR 0x4d35... AND 0xa3f47..., THEN CONTINUE TO NEWS ROUTING + LORE + DEV BUY.`
