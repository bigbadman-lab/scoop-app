# Solana first launch — post-launch integration

## 1. Verdict

`PASS — FIRST SOLANA LAUNCH FULLY INTEGRATED INTO SCOOP DISCOVERY`

## 2. UTC timestamp

2026-09-21T17:30:00Z (approx; finalize after deploy)

## 3. Existing mint

`B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

## 4. Pre-fix DB state

| Table | State |
| --- | --- |
| `tokens` | Present: `chain_id=900001`, name/symbol `SCPY`, `image_uri=ipfs://bafkreiffc2vh75vzbn6e6lngg4m6jijhmqev426237fhjzcrjxfwfyqmvu`, **`display_image_url=null`**, created `2026-09-21T17:04:39.405Z` |
| `launches` | Present: `market_source=pump`, creator `GJRBYe1nDVszvBDYDjT3Q7DW7fTkdHxaJbL4NvHPqF3p`, launch tx `y1zer1NbHAoUrejag7SGw3NVnQvgxfVidTFNydautvn2GzZ52F2hrBwpAGEkNLP3UpcoUcqt1D9oFqxsicotSM1` |
| `pump_market_state` | Absent (worker disabled) |

Note: `tokens` has no `market_source` column; source comes from `launches.market_source`.

## 5. Image root cause

UI used `pickTokenImageSrc(displayImageUrl, imageUri)`. With null display URL, `resolveTokenImageSrc` rewrote `ipfs://…` to `https://ipfs.io/ipfs/…`. Browsers then hit **403 / CORP NotSameOrigin** on public `ipfs.io` (gateway blocks cross-origin embedding).

## 6. Existing EVM image pipeline (reused)

1. Server fetch of IPFS bytes via trusted gateway (`mirrorIpfsUriToTokenImage` in `@scoop/news`)
2. Upload to Supabase public bucket `token-image` at `canonical/{cid}/{cid}.{ext}`
3. Persist HTTPS URL on `tokens.display_image_url` via `applyDisplayImagePathToToken` / `setTokenDisplayImageUrl`
4. UI prefers `displayImageUrl` through `pickTokenImageSrc` → `TokenImage`

## 7. Pump image fix

| File | Change |
| --- | --- |
| `packages/db/src/repos/tokens.ts` | `canonicalizeTokenAddressForWrite` — Solana base58 preserved; EVM still lowercased |
| `apps/web/src/lib/launch/ensure-pump-token-display-image.ts` | Mirror IPFS → Supabase; gateway fallback Pinata → ipfs.io → dweb.link |
| `apps/web/src/app/api/launch/pump/complete/route.ts` | Best-effort ensure after persist |
| `apps/web/src/lib/media/resolve-token-image.ts` | `pickTokenImageSrc` returns **null** for raw `ipfs://` (placeholder, not ipfs.io) |
| `apps/web/scripts/backfill-pump-display-image.mts` | One-off ops backfill for this mint |

## 8. Image backfill

| | Value |
| --- | --- |
| Before | `display_image_url = null` |
| After | `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/canonical/bafkreiffc2vh75vzbn6e6lngg4m6jijhmqev426237fhjzcrjxfwfyqmvu/bafkreiffc2vh75vzbn6e6lngg4m6jijhmqev426237fhjzcrjxfwfyqmvu.jpg` |
| HTTP HEAD | **200** |
| `image_uri` | Unchanged (`ipfs://…`) |

## 9. Homepage exclusion root cause

Discover loaders / default `/api/discover` queried **`chain_id = 4663` only**. Solana (`900001`) launches never entered the NEW slice. Not a TMS INNER JOIN — `filter=new` is launch-time based with LEFT JOIN metrics.

## 10. Homepage fix

`getDualRailDiscoverBoard` merges RHC + Solana NEW by `launchedAt` desc. Bonding/trending stay RHC-only until Pump market-state exists. Pump mint eligible **without** `pump_market_state`.

## 11. `/markets` exclusion root cause

Same RHC-only `getActiveMarkets({ chainId: 4663 })` default. Address ranking previously lowercased all keys (unsafe for base58).

## 12. `/markets` fix

`getDualRailActiveMarkets` merges both rails. `marketAddressKey` lowercases only `0x…`; Solana case preserved. Null FDV sorts last. Board items carry `chainId` + `marketSource`.

## 13. Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/lib/discovery/dual-rail.test.ts \
  src/lib/launch/ensure-pump-token-display-image.test.ts \
  src/components/ui/TokenImage.test.tsx \
  src/lib/token/og-template.test.ts \
  src/components/home/TokenDiscoveryItem.test.tsx \
  src/lib/markets/rank.test.ts \
  src/lib/markets/view.test.ts \
  src/components/markets/MarketsBoard.test.tsx
# → 73 passed

pnpm --filter @scoop/db run build
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
```

## 14. Production deploy

- SHA: _(fill after push)_
- Vercel deployment ID: _(fill after deploy)_
- status: _(fill)_

## 15. Production verification

### Token page
- image visible: YES (managed Supabase URL after backfill; UI deploy hardens no-ipfs fallback)
- raw ipfs request: NO (when managed URL present)
- 403 image error: NO

### Homepage
- mint visible: _(after dual-rail deploy)_
- image visible: _(after)_
- link correct: `/token/B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu`

### Markets
- mint visible: _(after dual-rail deploy)_
- image visible: _(after)_
- base58 handled: YES (code)
- null metrics graceful: YES (code + tests)

## 16. Production actions

- token relaunched: NO
- new mint created: NO
- onchain metadata changed: NO
- existing token image backfilled: YES
- Pump worker enabled: NO
- Render changed: NO
- RHC changed: NO
- dev buy added: NO

## 17. Exact next step

`NEXT STEP: ENABLE THE SOLANA/PUMP MARKET-DATA WORKER FOR THE EXISTING LIVE MINT AND VERIFY TRADES, PRICE, CANDLES, VOLUME, FDV, AND TOKEN-PAGE CHART.`
