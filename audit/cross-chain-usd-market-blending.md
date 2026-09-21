# Cross-chain USD market blending

## 1. Verdict

`BLOCKED — CROSS-CHAIN USD MARKET BLENDING INCOMPLETE`

## 2. UTC timestamp

2026-09-21T19:28:38Z

## 3. SOL/USD source

**No trusted SOL/USD source exists in SCOOP for canonical ranking or market USD fields.**

| Candidate | Finding |
|-----------|---------|
| `quote_price_snapshots` + `ScoopPriceOracle` | RHC only. Snapshots quote assets registered with `oracle_feed` on Robinhood Chain (`listSnapshotEligibleQuoteAssets`). No Solana / wrapped-SOL feed. |
| Homepage desk ticker (`apps/web/src/lib/market/spot.ts`) | CoinGecko `ethereum,bitcoin` + Yahoo `^GSPC` / `^FTSE`. **No SOL.** Production `/api/market/spot` returns ETH/BTC/SPX/FTSE only. |
| Pump worker / Alchemy | Emits `price_sol` / `fdv_sol` / `volume_24h_sol` only — no USD. |
| Shared math (`priceUsdX18FromQuote`, `fdvUsdX18FromPrice`, `notionalUsdX18FromQuoteAmount`) | Ready to multiply quote × quote/USD once a `solUsdX18` exists — **inputs missing**. |

Step 2 of this gate requires: if none exists, **STOP and report the gap before adding a new external dependency**. Do not silently wire a random public API.

Closest reusable infrastructure (not yet SOL-capable):

- Desk CoinGecko helper in `spot.ts` (display-grade `number`, ~20s `revalidate`) — would need explicit product approval to extend `ids=…,solana` and promote to x18 for ranking.
- RHC oracle snapshot pipeline — would need a Solana-side or off-chain SOL/USD feeder into `quote_price_snapshots` (schema/key design + worker cadence). **Out of hard scope** without an approved source decision.

Current SOL/USD value during verification: **N/A — unavailable.**

## 4. Solana USD model

Intended (blocked pending SOL/USD):

```text
priceUsdX18  = priceUsdX18FromQuote({ priceQuoteX18: priceSolX18, quoteUsdX18: solUsdX18 })
fdvUsdX18    = priceUsdX18FromQuote({ priceQuoteX18: fdvSolX18,   quoteUsdX18: solUsdX18 })
volume24hUsd = notionalUsdX18FromQuoteAmount({ quoteAmountRaw: lamports, quoteUsdX18: solUsdX18, quoteDecimals: 9 })
```

Precision helpers already exist in `@scoop/shared`. Overlay choke point already exists: `applyPumpMarketStateToTokenDetail` — today it **hard-nulls** all USD fields.

## 5. SCPY metrics

Mint: `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`  
Source: live `https://scoop.fun/api/discover` @ verification time.

| Field | Value |
|-------|-------|
| price SOL | `0.00000002` (`priceQuoteDisplay`) |
| SOL/USD | **unavailable** |
| price USD | **null** |
| FDV SOL | `28.14124455` (`fdvQuoteDisplay`) |
| FDV USD | **null** (`fdvUsdX18` / `fdvUsdDisplay`) |
| volume SOL | `4.630255521` |
| volume USD | **null** |
| trades 24h | `11` |

## 6. Homepage

- **New:** RHC + Solana already blended (SCPY first by `launchedAt`). SOL-native metrics show; USD absent.
- **Default surface:** New tab — Solana visible with Network badge.
- **Trending:** RHC-only (`getDualRailDiscoverBoard` returns `trending: rhc.trending`). SQL requires `token_market_state.volume_24h_usd_x18 > 0` — Pump has no TMS USD row, so Solana cannot enter trending until USD is derived **and** dual-rail merges a Solana trending slice.
- **Bonding:** RHC-only by design (no Pump bonding-state projection).

## 7. Markets

- RHC + Solana already blended in the list (SCPY present).
- FDV sort uses `fdvUsdX18` → Solana **null → last** (rank 13/13 at last check).
- Trades sort works with Pump `tradeCountAllTime` (24h proxy).
- Holders: Solana shows `—` (deferred); row not hidden.

## 8. RHC regression

Not applicable — no conversion code shipped. RHC USD path untouched.

## 9. Tests

None added (implementation stopped per Step 2).

## 10. Files changed

| File | Purpose |
|------|---------|
| `audit/cross-chain-usd-market-blending.md` | This BLOCKED report |

No application code changed.

## 11. Deploy

- SHA: N/A (docs-only)
- Vercel: unchanged
- status: N/A

## 12. Production verification

### Homepage
- blended: YES (New tab; 1 Solana mint)
- SCPY visible: YES
- USD price correct: NO (null)
- USD FDV correct: NO (null)

### Markets
- blended: YES
- SCPY visible: YES
- USD FDV ranking works: NO (null FDV → buried last)
- not buried due to null USD FDV: NO

## 13. Production actions

- Solana worker logic changed: NO
- Alchemy changed: NO
- RHC indexer changed: NO
- DB schema changed: NO
- launch flow changed: NO
- fake USD values: NO

## 14. Exact next step

**Decision required before implementation:**

1. **Approve extending existing desk CoinGecko fetch** to include `solana`, convert to `solUsdX18`, and apply via `applyPumpMarketStateToTokenDetail` + dual-rail trending merge; **or**
2. **Specify an alternate trusted SOL/USD source** (oracle / snapshot table / other) that SCOOP should treat as canonical for ranking.

Until that decision, do not invent USD from an unapproved feed.

Suggested implementation once approved (CoinGecko desk path):

1. Extend `fetchCrypto` / add `getSolUsdX18()` beside `spot.ts` (or shared server helper).
2. Pass `solUsdX18` into `applyPumpMarketStateToDiscoveryItems` / `getTokenWithPumpMarketState`.
3. Populate `priceUsd*` / `fdvUsd*` / `volume24hUsd*` with shared mulDiv helpers; keep SOL quote fields.
4. Merge Solana into homepage Trending using derived USD volume + trade counts (in-memory rank if TMS SQL remains EVM-only).
5. Markets FDV rank then includes Solana naturally.
6. Tests for tiny `price_sol` × realistic SOL/USD, FDV, volume, RHC regression.
