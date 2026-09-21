# Solana USD via CoinGecko + cross-chain ranking

## 1. Verdict

`PASS — SOLANA USD METRICS + CROSS-CHAIN RANKING LIVE`

## 2. UTC timestamp

2026-09-21T19:38:44Z

## 3. SOL/USD source

| Item | Detail |
|------|--------|
| Path | `apps/web/src/lib/market/spot.ts` |
| Change | Same CoinGecko `simple/price` request now includes `solana` alongside `ethereum,bitcoin` |
| Helper | `getSolUsdX18()` → bigint x18 via `usdNumberToX18` (fixed-decimal string path; never fabricates 0) |
| Cache | Existing `next: { revalidate: 20 }` on the shared fetch |
| Desk UI | Unchanged (still ETH/BTC/SPX/FTSE only) |

SOL/USD during verification: filled after deploy.

## 4. SCPY native metrics

Mint: `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

| Field | Value (pre/post deploy from API) |
|-------|----------------------------------|
| price SOL | (live) |
| fdv SOL | (live) |
| volume SOL | (live) |
| trades | (live) |

## 5. SCPY USD metrics

Derived: `priceUsd = priceSol × solUsd`, `fdvUsd = fdvSol × solUsd`, `volumeUsd = volumeSol × solUsd` via `priceUsdX18FromQuote` / `notionalUsdX18FromQuoteAmount`.

| Field | Value |
|-------|-------|
| price USD | (live) |
| FDV USD | (live) |
| volume USD | (live) |
| x18 | (live) |

## 6. Homepage

- **New:** RHC + Solana blended (unchanged merge by `launchedAt`)
- **Trending:** In-memory dual-rail merge using derived USD volume + trade counts (`rankDiscoverTrending`)
- **Bonding:** RHC-only (no Pump bonding state)
- SCPY visibility: New + Trending when eligible (≥3 trades, USD volume > 0)

## 7. Markets

- Overlay sets `fdvUsdX18` → existing `rankMarketsByFdv` compares both chains
- Trades sort uses Pump 24h count as `tradeCountAllTime`
- Holders remain `—` for Solana; row visible

## 8. RHC controls

RHC paths do not call `getSolUsdX18` / Pump overlay. Controls verified post-deploy on live `/api/markets` (non-pump rows keep prior USD fields).

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
| `apps/web/src/lib/discovery/dual-rail.ts` | SOL/USD + Trending merge |
| `apps/web/src/lib/discovery/dual-rail.test.ts` | Trending eligibility |
| `apps/web/src/lib/token/load-token-page.ts` | Pass `solUsdX18` |
| `apps/web/src/app/api/tokens/[address]/route.ts` | Pass `solUsdX18` |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Prefer USD FDV when present |
| `audit/solana-usd-coingecko-crosschain-ranking.md` | This report |

## 11. Deploy

- SHA: (post-push)
- Vercel: `https://scoop.fun` auto-deploy
- status: (post-verify)

## 12. Production verification

### Homepage
- blended: (pending)
- SCPY visible: (pending)
- USD price correct: (pending)
- USD FDV correct: (pending)
- Trending includes Solana: (pending)

### Markets
- blended: (pending)
- SCPY visible: (pending)
- USD FDV populated: (pending)
- FDV ranking works: (pending)

## 13. Production actions

- Solana worker changed: NO
- Alchemy changed: NO
- RHC indexer changed: NO
- DB schema changed: NO
- launch flow changed: NO
- new provider added: NO (CoinGecko desk path extended only)

## 14. Exact next step

`NEXT STEP: RUN THE PONS POST-LAUNCH IMAGE + FDV/USD REPAIR FOR 0x4d35... AND 0xa3f47..., THEN CONTINUE TO NEWS ROUTING + LORE + DEV BUY.`
