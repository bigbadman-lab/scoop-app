# Solana visual polish + discovery metrics

## 1. Verdict

`PASS — SOLANA VISUAL POLISH + DISCOVERY METRICS COMPLETE`

## 2. UTC timestamp

2026-09-21T19:10:09Z

## 3. Homepage metric root cause

Discovery SQL (`packages/db/src/queries/_discoverySql.ts` `DISCOVERY_SELECT`) only `LEFT JOIN`s EVM `token_market_state`. Dual-rail homepage (`getDualRailDiscoverBoard`) merged Pump NEW rows but never read `pump_market_state`, so price / FDV / volume / trades stayed null on `TokenDiscoveryItemCard`.

## 4. Homepage fix

- Source: `pump_market_state` via batch `getPumpMarketStates` + `applyPumpMarketStateToDiscoveryItems`
- Wired in: `getDualRailDiscoverBoard` after merge
- Fields: `priceQuote*`, `volume24hQuote*`, `tradeCount24h` / `tradeCountAllTime` (24h), buy/sell counts, `lastTradeAt`, `fdvQuoteDisplay` from `fdv_sol`
- Units: SOL quote display only — USD left null; `displayMarketFdv` / `displayTokenPrice` / `displayVolume24hMetric` never prefix `$` for quote values

## 5. Markets metric root cause

Same TMS-only join through `getActiveMarkets` → `getDualRailActiveMarkets`. Board used `fdvUsdDisplay` + `tradeCountAllTime` only, so Pump rows rendered `—`.

## 6. Markets fix

- Same overlay in `getDualRailActiveMarkets`
- `MarketsBoardItem` carries price/volume/FDV quote fields
- `MarketRow`: SOL FDV without `$`; trades from 24h count; price · volume under identity
- Ranking: Pump `fdvUsdX18` remains null → nulls last; RHC USD FDV ranking unchanged

## 7. Solana badge

- Asset: `/brand/solana.svg` (`apps/web/public/brand/solana.svg`)
- Component: `NetworkBadge` (same family as `QuoteAssetBadge`: padding, border, radius, 14px icon, mono label)
- Surfaces: homepage discovery cards, `/markets` rows, token-page Network row
- Label: `SOLANA` (not Pump); RHC uses `rh.svg` + `RHC` for parity

## 8. Solana CTA text

- `Trade on Pump.fun →` (`token-trade-pump-link`): `text-white!` to beat `a { color: inherit }`
- Other Solana CTA: external Pump.fun / explorer links keep green link chrome (not primary green buttons)
- EVM CTAs unchanged

## 9. Signed-out account cleanup

Removed `ACCOUNT_OPENERS` (Profile / Tokens launched / Fees) from `AccountSignedOut` / pending frame. Signed-in `AccountPageLive` unchanged.

## 10. Tests

```bash
pnpm --filter @scoop/db exec vitest run src/queries/pump-market.test.ts
pnpm --filter @scoop/web exec vitest run \
  src/components/ui/NetworkBadge.test.tsx \
  src/components/home/TokenDiscoveryItem.test.tsx \
  src/components/account/AccountSignedOut.test.tsx \
  src/components/token/TokenBuySell.test.tsx \
  src/components/token/TokenMarketShell.test.tsx \
  src/components/markets/MarketsBoard.test.tsx \
  src/lib/format.test.ts \
  src/lib/discovery/dual-rail.test.ts
pnpm --filter @scoop/db run build
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
```

Results: focused tests PASS; typecheck PASS; build PASS.

## 11. Files changed

| File | Purpose |
|------|---------|
| `packages/db/src/dto.ts` | Optional `fdvQuoteDisplay` |
| `packages/db/src/repos/pump-market-state.ts` | `getPumpMarketStates` batch |
| `packages/db/src/queries/pump-market.ts` | Overlay + discovery batch apply |
| `packages/db/src/queries/_discoverySql.ts` | Default `fdvQuoteDisplay: null` |
| `packages/db/src/live/merge-live-market.ts` | Default `fdvQuoteDisplay: null` |
| `packages/db/src/index.ts` / `queries/index.ts` | Exports |
| `apps/web/src/lib/discovery/dual-rail.ts` | Overlay on discover + markets |
| `apps/web/src/lib/format.ts` | `displayMarketFdv` |
| `apps/web/src/lib/markets/types.ts` | Board price/volume/FDV quote fields |
| `apps/web/src/components/ui/NetworkBadge.tsx` | Shared network badge |
| `apps/web/src/components/home/TokenDiscoveryItem.tsx` | Metrics + badge |
| `apps/web/src/components/markets/MarketRow.tsx` | Metrics + badge |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Network badge |
| `apps/web/src/components/token/TokenBuySell.tsx` | White Pump CTA |
| `apps/web/src/components/account/AccountSignedOut.tsx` | Remove openers |
| Tests + `audit/solana-visual-polish-and-discovery-metrics.md` | Coverage + report |

## 12. Production deploy

- SHA: (filled after push)
- Vercel deployment ID: (filled after deploy)
- status: (filled after deploy)

## 13. Production verification

### Homepage
- mint visible: (pending)
- Solana badge: (pending)
- price: (pending)
- volume: (pending)
- trades: (pending)
- FDV: (pending)

### Markets
- mint visible: (pending)
- Solana badge: (pending)
- base58 copy: (pending)
- price: (pending)
- volume: (pending)
- trades: (pending)

### Token page
- Solana badge: (pending)
- Trade on Pump white text: (pending)
- chart/trades still working: (pending)

### Account signed out
- Profile hidden: (pending)
- Tokens launched hidden: (pending)
- Fees hidden: (pending)

### Account signed in
- account UI preserved: (pending)

## 14. Production actions

- Solana worker changed: NO
- Alchemy config changed: NO
- RHC code changed: NO
- Pump launch flow changed: NO
- dev buy added: NO
- news routing changed: NO
- DB schema changed: NO

## 15. Exact next step

`NEXT STEP: COMPLETE THE COMBINED NEWS AUTO-ROUTING + PUMP LORE DURABILITY + SOLANA DEV BUY GATE.`
