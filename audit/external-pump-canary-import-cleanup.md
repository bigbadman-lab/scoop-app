# SCOOP — EXTERNAL PUMP IMPORT CANARY + CLEAN REMOVAL

## 1. Verdict

```text
PASS — EXTERNAL PUMP IMPORT + CLEANUP CANARY VERIFIED
```

Notes (non-blocking):

- Production `/token/<mint>` returned HTTP `500` for the canary **and** for existing SCPY during the same window — pre-existing Solana token-page SSR issue, not introduced by this import path. HTML title still resolved to correct name/symbol while imported; markets/homepage APIs worked from DB.
- After primary `official:canary-remove`, the live Alchemy worker briefly re-wrote mint-scoped `pump_*` rows from an in-memory watchlist. Mint-scoped orphan scrub cleared them; 60s poll confirmed no further writes once watchlist refresh dropped the mint.

---

## 2. UTC timestamp

`2026-09-22T13:54:38Z` (report finalize)

Gate window: migration ~13:48Z → import `13:49:58Z` → cleanup ~13:52Z → orphan scrub settle ~13:54Z.

---

## 3. Canary mint

```text
3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump
```

Exact base58 preserved throughout.

---

## 4. Pump preflight

| Field | Value |
|-------|-------|
| Name | I identify as rich |
| Symbol | Transfinance |
| Decimals | 6 |
| Supply | 969300603471896 |
| Creator | `4fZFcK8ms3bFMpo1ACzEUz8bH741fQW4zhAMGd5yZMHu` |
| Bonding curve | `7ZaR7rPp8mGuYd8Mr15UzYEHDVBTEbH64EoC621uxaKA` |
| Metadata URI | `https://m.rapidlaunch.io/m/F4vvODmAX` |
| Image URI | `https://m.rapidlaunch.io/images/F4vvODmAX.jpg` |
| Launch signature | `4vM2CmpHzns9Ly6kZSzdP6NiEBrJo3uegLBfmh3nMHELUr7mzy6wxfm8zi8RzEuocXRdCURQChmxfxJhEMyh5DpQ` |
| Launch slot | 449382562 |
| Launched at | 1790081074 |
| Pump provenance | **verified** |

Command: `pnpm official:canary-import -- --mint 3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump --preflight-only`

---

## 5. Import path

Reusable path (same intended for official `$TAPE`):

```text
preflightExternalPumpMint
  → importExternalPumpMarket
    → upsertPumpMarket (chain_id=900001, market_source=pump)
    → ensurePumpTokenDisplayImage
        → ensureTokenDisplayImageFromIpfs
        → mirrorHttpsUriToTokenImage (HTTPS metadata images)
    → registerExternalPumpImport (import_kind=canary)
```

CLI: `apps/web/scripts/official-canary-import.mts`  
Confirm: `--confirm` required.

Confirmed: **not** a throwaway canary-only persistence path.

---

## 6. Persisted state

Created/updated during import:

| Table / object | Result |
|----------------|--------|
| `tokens` | 1 row (`created: true`) |
| `launches` | 1 row (`market_source=pump`, `chain_id=900001`) |
| `external_pump_import_canaries` | 1 row (`import_kind=canary`) |
| `display_image_url` | applied via Supabase `token-image` |
| Worker watchlist | present via `getPumpWatchlistItem` |
| `pump_market_state` / trades / candles / checkpoints | populated by live Alchemy worker after watchlist pickup |

Identity: `chain_family=solana`, `chain_id=900001`, `market_source=pump`.

---

## 7. Image

| Item | Value |
|------|-------|
| Raw image URI | `https://m.rapidlaunch.io/images/F4vvODmAX.jpg` |
| Canonical `display_image_url` | `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/manual/d710b52504b08209/d710b52504b08209.jpg` |
| Mirror status | `ok: true`, `status: applied` |
| HTTP HEAD | **200**, `content-type: image/jpeg` |

No manual image upload. No raw-IPFS dependency for display URL.

---

## 8. Token page

| Check | Result |
|-------|--------|
| Route | `https://scoop.fun/token/3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump` |
| Loads | Metadata/title **YES** (`I identify as rich (Transfinance) · SCOOP`); HTTP status **500** (pre-existing — SCPY same) |
| Metadata correct | **YES** (name + symbol in document title) |
| Image correct | Driven by DB `display_image_url` (markets API returned canonical HTTPS URL) |
| Solana/Pump identity | Markets row: `chainId=900001`, `marketSource=pump` |

Vercel did **not** require a new deploy for DB-driven markets/API visibility. Token-page SSR 500 is orthogonal to this gate’s import path.

---

## 9. Alchemy

| Check | Result |
|-------|--------|
| Worker watchlist | **YES** (`getPumpWatchlistItem` returned mint; launches⨝tokens join present) |
| Market state | **YES** (`pump_market_state` present during imported window) |
| Trades/candles | **YES** — grew under live worker (cleanup plan saw **109** trades / **5** candles before delete) |
| Holders | `holderCountAll` / retail null on markets row (not required for PASS) |

No hard-coded mint in worker.

---

## 10. Discovery

| Surface | Visible |
|---------|---------|
| `/api/markets` | **YES** — mint in `items` (15 → later 14 after cleanup) with full Solana/Pump fields + mirrored image |
| `/markets` HTML | **YES** — mint present in page payload while imported |
| Homepage | **YES** — `Transfinance` present while imported; **absent** after cleanup |

No special pinned placement.

---

## 11. Canary footprint

Recorded before cleanup (`collectExternalPumpCanaryFootprint` + cleanup plan):

```text
mint: 3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump
registry: canary @ launchSignature 4vM2CmpH…Myh5DpQ
token: true
launch: true
pumpMarketState: true
pumpTrades: 109
pumpCandles: 5
pumpCheckpoints: true
scoopSupportBuys: 0
displayImageUrl: https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/manual/d710b52504b08209/d710b52504b08209.jpg
imageUri: https://m.rapidlaunch.io/images/F4vvODmAX.jpg
```

---

## 12. Cleanup

Command:

```bash
pnpm official:canary-remove -- --mint 3wMj4yBCGoV4fBJKdhHHCP9ZR1npcoBb6FQpCbSLpump --confirm "REMOVE EXTERNAL PUMP CANARY"
```

Confirmation phrase required: `REMOVE EXTERNAL PUMP CANARY`.

Primary delete counts:

| Table | Deleted |
|-------|---------|
| `scoop_support_buys` | 0 |
| `pump_candles` | 5 |
| `pump_trades` | 109 |
| `pump_market_state` | 1 |
| `pump_worker_checkpoints` | 1 |
| `launches` | 1 |
| `tokens` | 1 |
| `external_pump_import_canaries` | 1 |

Follow-up mint-scoped orphan scrub (worker race after primary delete): candles 3, trades 14, market_state 1, checkpoints 1.

Image cleanup: **DB references removed**; content-addressed Supabase object retained (shared/manual path — safe).

Unrelated rows affected: **0**.

---

## 13. Post-cleanup

| Check | Result |
|-------|--------|
| Token page | HTTP **200**, not-found behavior; `Transfinance` absent |
| `/api/markets` | Canary **absent** (`items` length 14) |
| Homepage | Canary **absent** |
| Worker watchlist | **absent** (`getPumpWatchlistItem` null); 60s poll — no new `pump_*` rows |
| DB active rows | token/launch/registry/state/trades/candles/checkpoints all **gone** |

Final footprint: all false/0/null.

---

## 14. Regression

| Check | Result |
|-------|--------|
| SCPY | Intact — `B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu` |
| Other Solana/Pump markets | Intact — `pump` launches count **2** after canary removal |
| RHC (`chain_id=4663`) | Intact — **16** launches |
| Markets catalogue | Dropped only the canary (15 → 14) |

---

## 15. Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/import-external-pump-market.test.ts \
  src/lib/launch/external-pump-canary-remove.test.ts
```

Result: **2 files / 6 tests passed** (2026-09-22T13:54:36Z).

---

## 16. Files changed

Gate implementation (parent session) + execution fixes used here:

| File | Purpose |
|------|---------|
| `supabase/migrations/20260922140000_external_pump_import_canaries.sql` | Canary registry table (applied to production) |
| `packages/db/src/repos/external-pump-imports.ts` | Registry + footprint + mint-scoped delete |
| `apps/web/src/lib/launch/import-external-pump-market.ts` | Reusable external Pump import |
| `apps/web/scripts/official-canary-import.mts` | Operator import CLI |
| `apps/web/scripts/official-canary-remove.mts` | Operator remove CLI |
| `apps/web/src/lib/launch/import-external-pump-market.test.ts` | Import unit tests |
| `apps/web/src/lib/launch/external-pump-canary-remove.test.ts` | Cleanup unit tests |
| `package.json` | `official:canary-import` / `official:canary-remove` scripts |
| `packages/{db,shared,news,contracts}/package.json` | Added `"default"` export maps so `tsx` can resolve workspace packages under Node 24 |

---

## 17. Deploy

| Item | Status |
|------|--------|
| HEAD SHA (local) | `86a03d6a7d05a52fc37b414d5753dc486f346ae6` |
| Migration | **Applied** to production Postgres (`external_pump_import_canaries`) via node+pg / `DATABASE_URL` |
| Render | No worker code deploy required for this gate; live Alchemy worker picked up mint via normal watchlist |
| Vercel | No new frontend deploy required for markets/API/homepage discovery (DB-driven). Token-page SSR 500 pre-existed |

---

## 18. Production actions

```text
blockchain tx broadcast: NO
Streamflow lock created: NO
official token configured: NO
announcement activated: NO
support-wallet buy made: NO
private key used: NO
```

Only operator DB writes: canary import rows + image mirror upload + mint-scoped cleanup.

---

## 19. Exact next step

```text
NEXT STEP: USE THE VERIFIED EXTERNAL-PUMP IMPORT PATH FOR THE REAL OFFICIAL $TAPE MINT, THEN COMPLETE STREAMFLOW LOCK + OFFICIAL TOKEN REGISTRATION + HOMEPAGE ANNOUNCEMENT.
```

Optional hardening before official: after canary-remove, either restart/refresh the Solana pump worker watchlist immediately or re-scrub mint-scoped `pump_*` orphans once so in-memory subscriptions cannot briefly re-insert market-data rows for a deleted launch.
