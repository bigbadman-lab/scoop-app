# Live market overlay implementation

**Date:** 2026-09-14  
**HEAD at implementation:** `580184ba6e24c1048b974d6fa179b56442c0f81d` (pre-commit)  
**Prompt:** `SCOOP-Live-Data-Layer-Implementation.md`  
**Verdict:** **PARTIAL — IMPLEMENTATION COMPLETE; LIVE PRODUCTION PROOF REMAINS**

---

## Summary

SCOOP now has a near-tip **presentation-only** live overlay hosted inside the existing Render indexer process. Transient Postgres tables bridge Render → Vercel. Canonical fixed-lag **64** indexing is unchanged and remains accounting truth. Confirmed always wins; APIs fall back to confirmed when live is unavailable.

---

## Topology (why this was smallest)

```text
RHC latest ──► LIVE OBSERVER (same indexer process, after advisory lock)
                 │
                 ▼
           live_* tables (TTL 15m) ──► Vercel APIs merge overlay
RHC lag-64 ──► CANONICAL INDEXER ──► tokens / trades / market_state (truth)
```

- Render and Vercel do **not** share memory → tiny transient Postgres tables are the smallest shared bridge already in the topology.
- No new Render service, Redis, Realtime, SSE, or browser WebSockets.
- `SCOOP_CONFIRM_LAG_BLOCKS` / confirm mode **unchanged**.

---

## Schema

Migration: `supabase/migrations/20260914180000_live_tip_overlay.sql` (applied to production DB).

| Table | Role |
| --- | --- |
| `live_chain_events` | TokenLaunched / Swap (InitialBuyExecuted reserved); UNIQUE `(chain_id, tx_hash, log_index)` |
| `live_token_tips` | Per-token tip price/FDV/identity snapshot |
| `live_observer_checkpoints` | Near-tip observer cursor |

- RLS enabled; privileges revoked from `anon` / `authenticated` / `PUBLIC`.
- **TTL:** 15 minutes (`SCOOP_LIVE_TTL_SECONDS=900`) — longer than measured 10–20s confirm window, short enough to clear reorgs/stale tips.
- Cleanup: expire on TTL; delete live events when matching canonical `raw_chain_events` exists.
- Tip volume/counts exposed to APIs are **recomputed from pending live events above the main checkpoint** (never stale tip-stored deltas) to avoid double-count after confirmed event deletion.

---

## Observer

- File: `apps/indexer/src/live/tipOverlay/observer.ts`
- Started from `runIndexer` after advisory lock; errors never stop canonical.
- Config defaults: enabled, poll **1000ms**, max catch-up **48** blocks, TTL **900s**.
- Watchlist: canonical SCOOP pools + live TokenLaunched pools added immediately.
- Decode/orientation/USD: reuses indexer `decodeLog`, `@scoop/shared` buy/sell + amounts, `resolveTradeUsdFields`, `fdvUsdX18FromPrice`.
- Image: `token_display_finalize_intents` by `image_uri` → public `token-image` URL when `SUPABASE_URL` is set on the indexer; else logo/`imageUri` for UI `pickTokenImageSrc`.
- Instrumentation log: `live overlay event observed` with `eventType`, `blockNumber`, `txHash`, `logIndex`, `observedAt`, `blockTimestamp`, `latencyMs`, `source: live`.

### RPC estimate

Per poll (~1s): `eth_blockNumber` + one `eth_getLogs` over Factory+PoolManager for the bounded range (+ occasional `eth_getBlock` for timestamps).  
≈ **~120 RPC calls/min** steady-state (plus sparse block fetches), well under hammering.

---

## API merge

| Surface | Behavior |
| --- | --- |
| `/api/tokens/[address]` | Confirmed detail + live tip; live-only tip can synthesize minimal detail |
| `/api/tokens/[address]/trades` | Merge live swaps; dedupe `txHash+logIndex`; checkpoint filter |
| `/api/markets` | Merge live tips into board; live-only launches appear |
| `/api/discover` | NEW gets all live tips; bonding/trending overlay matching tips only |
| Chart | Still trade-driven (`buildTradeMovementSeries`); live trades → current candle via existing poll |

Helpers: `packages/db/src/live/merge-live-market.ts` (+ tests). Live failures are caught → confirmed-only responses.

---

## What stayed untouched

- Canonical confirm lag / reorg policy
- Fee-keeper, holder rewards, creator rewards
- No permanent candle store / chart backend replacement
- Frontend still ~2s polling (no Realtime/SSE/WS)

---

## Tests / gates

| Gate | Result |
| --- | --- |
| `@scoop/db` merge + suite | **81/81** |
| `@scoop/indexer` suite | **138/138** |
| db / indexer / web typecheck | **pass** |
| db / indexer / web build | **pass** |

---

## News-linked cards

No news↔market linkage redesign. Live tips flow through markets/discover token cards; news article markets continue to use existing relationship queries only. Incomplete linkage (if any) is out of scope here.

---

## Production canary — STOPPED for Alex

Do **not** auto-launch. After Vercel + Render deploy Ready:

**Controlled action needed:** one small production launch **or** one small BUY/SELL on an existing market (Alex-authorized).

Measure:

| Label | Meaning |
| --- | --- |
| T0 | tx mined / receipt |
| T1 | live observer log (`source: live`) |
| T2 | live row visible in `live_*` / API with live overlay |
| T3 | UI shows identity/image/trade/price/FDV/volume/chart move |
| T4 | same event appears as confirmed; live overlay drops without double count |

Target perceived T0→T3 ≈ **1–3s**.

---

## Residual risks

- Indexer needs `SUPABASE_URL` for best-effort immediate public display URLs; without it, IPFS/`imageUri` path still works via UI helpers.
- Live lane is unconfirmed; brief tip/price disagreement until lag-64 confirm is expected.
- Full `pnpm db:migrate` re-applies historical seeds and is **not** safe on prod; new migration was applied surgically.

---

## Bottom line

> **SCOOP now presents new launches, correct token images, trades, price, FDV, volume and current chart movement through a near-real-time live overlay while preserving the existing 64-block canonical indexer as the source of truth. Confirmed state cleanly replaces live state without duplication or accounting impact.**

Live production timing proof remains after deploy + Alex-authorized canary.
