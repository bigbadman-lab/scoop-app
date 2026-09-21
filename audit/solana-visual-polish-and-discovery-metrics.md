# Solana visual polish + discovery metrics

## 1. Verdict

`PASS — SOLANA VISUAL POLISH + DISCOVERY METRICS COMPLETE`

## 2. UTC timestamp

2026-09-21T19:14:00Z

## 3. Homepage metric root cause

Discovery SQL (`packages/db/src/queries/_discoverySql.ts` `DISCOVERY_SELECT`) only `LEFT JOIN`s EVM `token_market_state`. Dual-rail homepage (`getDualRailDiscoverBoard`) merged Pump NEW rows but never read `pump_market_state`, so price / FDV / volume / trades stayed null on `TokenDiscoveryItemCard`.

## 4. Homepage fix

- Source: `pump_market_state` via batch `getPumpMarketStates` + `applyPumpMarketStateToDiscoveryItems`
- Wired in: `getDualRailDiscoverBoard` after merge
- Fields: `priceQuote*`, `volume24hQuote*`, `tradeCount24h` / `tradeCountAllTime` (24h), buy/sell counts, `lastTradeAt`, `fdvQuoteDisplay` from `fdv_sol`
- Units: SOL quote display only — USD left null; `displayMarketFdv` / `displayTokenPrice` / `displayVolume24hMetric` never prefix `$` for quote values
- Wrapped-SOL mint maps to display symbol `SOL` (not truncated address)

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
| `apps/web/src/lib/quotes/resolve.ts` | Wrapped-SOL → `SOL` label |
| `apps/web/src/components/ui/NetworkBadge.tsx` | Shared network badge |
| `apps/web/src/components/home/TokenDiscoveryItem.tsx` | Metrics + badge |
| `apps/web/src/components/markets/MarketRow.tsx` | Metrics + badge |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Network badge |
| `apps/web/src/components/token/TokenBuySell.tsx` | White Pump CTA |
| `apps/web/src/components/account/AccountSignedOut.tsx` | Remove openers |
| Tests + this audit | Coverage + report |

## 12. Production deploy

- SHA: `aa7f872` (`2be639d` metrics/badge/CTA/account + SOL quote label)
- Vercel: auto-deploy from `main` to `https://scoop.fun`
- Observed `x-vercel-id`: `lhr1::iad1::8fstr-1790018038670-3e9a0390d5ce`
- status: READY (`/api/markets` quoteSymbol=`SOL`; overlay fields live)

## 13. Production verification

Live mint: `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

### Homepage
- mint visible: YES
- Solana badge: YES (`network-badge-solana` + `/brand/solana.svg`)
- price: YES (`0.00000002` from `pump_market_state`)
- volume: YES (`4.630255521`)
- trades: YES (`11`)
- FDV: YES (`28.14124455` SOL — no `$`)

### Markets
- mint visible: YES
- Solana badge: YES
- base58 copy: YES (token link preserves mint; identity uses base58 address)
- price: YES
- volume: YES
- trades: YES (`11`)

### Token page
- Solana badge: YES
- Trade on Pump white text: YES (`text-white!`)
- chart/trades still working: YES

### Account signed out
- Profile hidden: YES
- Tokens launched hidden: YES
- Fees hidden: YES

### Account signed in
- account UI preserved: YES (no signed-in code path changed)

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
