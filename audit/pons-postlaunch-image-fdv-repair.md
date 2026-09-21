# PONS Post-Launch Image + FDV Repair

## 1. Verdict

`BLOCKED — PONS POST-LAUNCH DATA STILL INCOMPLETE`

Images restored for both canaries. Token A (ETH-quoted `$NOMI`) FDV/USD repaired end-to-end. Token B (`MOSS`) remains without USD/FDV because its quote asset is Robinhood **GLD** (`0xc9a981…`), which is **not** registered on ScoopQuoteRegistry / ScoopPriceOracle and has **no** Chainlink feed in Scoop’s 22-asset catalogue. Honest null USD retained (no fabrication; no protocol tx).

## 2. UTC timestamp

2026-09-21T20:15:00Z

## 3. Affected tokens

- Token A: `0x4d35b131c2463ffb9cb2435e6df85d287f494b8b` (`$NOMI`)
- Token B: `0xa3f47a8a3032707b8bd414e96beebe82c97b4336` (`MOSS`)

## 4. Working legacy controls

- `0x1545556c103c307ca2e82e637ee92719099903b6` (FORGE) — scoop, image + FDV OK
- `0x5d7493b2d151d35cbe172c10713bf50b83e58392` (TAPE) — scoop, image + FDV OK
- `0x6b572b7c8c89dec05584fb153025b75ca429520b` (SRVSTATE) — scoop, image + FDV OK

## 5. Image root cause

PONS indexer only called `applyBoundDisplayImageOnTokenInsert` (intent-path bind). Neither canary had a `token_display_finalize_intents` row, so `display_image_url` stayed null while `image_uri` remained raw `ipfs://`. UI refuses to render IPFS in-browser. Legacy Scoop launches succeeded because pin-time intents existed. Pump already had an IPFS→Supabase mirror; PONS did not reuse it.

## 6. Image fix

- Generalized shared helper `ensureTokenDisplayImageFromIpfs` (same `mirrorIpfsUriToTokenImage` + `applyDisplayImagePathToToken` path as Pump).
- `ensurePumpTokenDisplayImage` now wraps that helper.
- Client `ensureTokenDisplayImage`: on bind `INTENT_NOT_FOUND` / 409, fall through to `/api/launch/display-image` finalize (IPFS fallback).

## 7. Image backfill

| Token | Before | After | HTTP |
|-------|--------|-------|------|
| A `$NOMI` | `display_image_url=null`, `ipfs://bafybeig2qhiu…` | `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/canonical/bafybeig2qhiu4c7oeddmivtvjjdawkasc3jf35643cusg64cdbvy2ncmwa/bafybeig2qhiu4c7oeddmivtvjjdawkasc3jf35643cusg64cdbvy2ncmwa.png` | 200 |
| B `MOSS` | `display_image_url=null`, `ipfs://bafkreigmbal…` | `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/canonical/bafkreigmbalvmkvrb33icpekpt6vxl3b6nifr3etymh72xa5trblqsjis4/bafkreigmbalvmkvrb33icpekpt6vxl3b6nifr3etymh72xa5trblqsjis4.jpg` | 200 |

On-chain metadata unchanged.

## 8. FDV root cause

1. `refreshPonsMarketActivity` hard-nulled `quoteUsdX18` / `priceUsdX18` / `fdvUsdX18` / `volume24hUsdX18`.
2. Discovery `mapDiscoveryItem` withheld all USD for `market_source=pons_v2`.
3. Token A: no CurveBuy indexed → `price_quote_x18=0` despite live curve reserves (`quoteReserve=1.68 ETH`).
4. Token B: quote `0xc9a981…` (GLD) absent from `quote_assets` + ScoopPriceOracle → `resolveUsdMarketFields` → `no_snapshot`.

## 9. Canonical pricing model

```
price_usd_x18 = price_quote_x18 * quote_usd_x18 / 1e18
fdv_usd_x18   = price_usd_x18 * total_supply_raw / 10^token_decimals
```

Helpers: `priceUsdX18FromQuote`, `fdvUsdX18FromPrice` (`@scoop/shared`), fed by `resolveUsdMarketFields` from `quote_price_snapshots` (ScoopPriceOracle path).

## 10. Token A values (`$NOMI`)

| Field | Value |
|-------|-------|
| Quote asset | ETH `0x000…000` |
| Price quote (x18) | `1680000000` (from curve `quoteReserve/tokenReserve`) |
| Quote USD (x18) | `2763340000000000000000` (~$2763.34) |
| Price USD (x18) | `4642411200000` |
| Supply | `1e27` raw / 18 decimals (1e9 tokens) |
| FDV USD (x18) | `4642411200000000000000` (~$4,642.41 ≈ 1.68 ETH × ETH/USD) |
| Displayed FDV | Requires web deploy of discovery withhold removal |

## 11. Token B values (`MOSS`)

| Field | Value |
|-------|-------|
| Quote asset | GLD `0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e` |
| Price quote (x18) | `10370197159` (last trade; reserves ≈ `9976238779`) |
| Quote USD | **null** — GLD not on ScoopPriceOracle / no catalogue snapshot |
| Price USD / FDV | **null** (honest) |
| Supply | `1e27` / 18 |

Unblocking Token B requires protocol ops outside this gate: register GLD on QuoteRegistry + configure Chainlink feed on ScoopPriceOracle (protocol txs), then catalogue + snapshot + revalue.

## 12. Legacy regression

FORGE control row left untouched by backfill scripts (images/USD already present). Discovery still exposes scoop USD as before.

## 13. Tests

```bash
pnpm --filter @scoop/db exec vitest run src/queries/market-source.test.ts
pnpm --filter @scoop/web exec vitest run src/lib/launch/ensure-display-image.test.ts \
  src/lib/launch/ensure-token-display-image-from-ipfs.test.ts \
  src/lib/launch/ensure-pump-token-display-image.test.ts
pnpm --filter @scoop/indexer exec vitest run src/live/normalizePonsLaunch.usd.test.ts \
  src/live/decodePons.test.ts
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
pnpm --filter @scoop/db run build
```

All listed vitest suites PASS; web typecheck + build PASS.

## 14. Files changed

- `apps/web/src/lib/launch/ensure-token-display-image-from-ipfs.ts` (+test) — shared IPFS mirror
- `apps/web/src/lib/launch/ensure-pump-token-display-image.ts` — thin wrapper
- `apps/web/src/lib/launch/ensure-display-image.ts` (+test) — bind→IPFS fallback
- `apps/web/scripts/backfill-pons-display-images.mts` — prod image backfill
- `apps/indexer/src/live/normalizePonsLaunch.ts` — `resolveUsdMarketFields` / trade USD
- `apps/indexer/src/live/normalizePonsLaunch.usd.test.ts`
- `apps/indexer/src/live/processBlock.ts` — reserve price + trade USD plumbing
- `apps/indexer/scripts/repair-pons-market-usd.mts` — canary USD repair
- `packages/db/src/queries/_discoverySql.ts` — stop withholding `pons_v2` USD
- `packages/db/src/queries/market-source.test.ts`

## 15. Production deploy

Pending commit/push of this change set (SHA recorded after push). Indexer Render deploy needed for forward PONS launches; DB rows for A/B images + Token A USD already repaired in production.

## 16. Production verification

### Token A
- image visible: YES (HTTPS display URL, HEAD 200)
- price USD correct: YES (DB; UI after deploy)
- FDV correct: YES (DB; UI after deploy)

### Token B
- image visible: YES (HTTPS display URL, HEAD 200)
- price USD correct: NO — blocked on GLD oracle
- FDV correct: NO — blocked on GLD oracle

### Legacy control
- unchanged: YES

## 17. Production actions

- protocol tx: NO
- Solana worker logic changed: NO
- RHC confirmation mode changed: NO
- news started: NO
- fee keeper started: NO
- holder rewards started: NO

## 18. Exact next step

`NEXT STEP: REGISTER GLD ON SCOOP QUOTE REGISTRY + PRICE ORACLE (PROTOCOL OPS), THEN SNAPSHOT/REVALUE MOSS; AFTERWARD RETURN TO TASK 3 SOLANA VISUAL POLISH / NEWS ROUTING.`
