# Production indexer latency audit

**Mode:** AUDIT ONLY — no production behavior, config, schema, deploy, or functional code changes.  
**Date:** 2026-09-14

## 1. Verdict

## `PASS — INDEXER LATENCY FULLY MAPPED; OPTIMIZATION PLAN READY`

Canonical site data is delayed primarily by (a) intentional **64-block fixed-lag** (~**6.4 s** on current RHC) plus (b) a **chronic catch-up deficit**: near-tip live-mode ingest processes roughly **~3–6 blocks/s** while RHC produces **~10 blocks/s**, so the main checkpoint often sits **~200–600 blocks behind tip** (~**20–60 s** extra). Live overlay is near tip; holders/volume/FDV that depend on canonical `token_market_state` still wait for the slower path. Frontend adds ~0–2 s poll.

**Recommended next action:** implement a **Tier A near-tip catch-up throughput fix** (raise moderate-lag ingest rate above chain rate — larger batch and/or range `getLogs` below the 5000-block fast-catchup threshold, plus reduce per-swap N+1 RPC), because measured production lag behind target is repeatedly **~210–570 blocks** even while `confirmLagBlocks=64` and health notes claim “caught up.”

---

## 2–3. Repo

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD | `2e7076213814b9ea74dd2749688b881a37220afc` |
| Git status | dirty: modified `audit/deterministic-token-image-binding.md`; many unrelated untracked audits/`P10.4-*` |

---

## 4. Production Render service

| Field | Value |
| --- | --- |
| Name | `scoop-app` (blueprint name in repo: `scoop-indexer`) |
| ID | `srv-daenmj6q1p3s73a4long` |
| Type | Background Worker |
| Live deploy | `dep-dak4ffis99js73bjr6i0` |
| Deployed SHA | **`2e70762`** (finished `2026-09-14T19:18:19Z`) |
| Instance | `srv-daenmj6q1p3s73a4long-5rzzx` created `19:17:30Z` |
| Plan (blueprint) | `starter` in `render.yaml` (dashboard plan name not fully exported by CLI) |

No secrets printed. RPC host observed via health: Alchemy `robinhood-mainnet.g.alchemy.com`.

---

## 5. Worker config (production-proven)

From `indexer_health.notes` + prior fixed-lag proof + code defaults:

| Setting | Production | Source |
| --- | --- | --- |
| `SCOOP_CONFIRM_MODE` | **`fixed-lag`** | health notes |
| `SCOOP_CONFIRM_LAG_BLOCKS` | **`64`** | health notes |
| `SCOOP_START_BLOCK` | `60525572` | config / historical |
| `SCOOP_POLL_INTERVAL_MS` | **2000** (default; idle only) | code + YAML |
| `SCOOP_MAX_BLOCK_BATCH` | **20** (default) | code + YAML |
| Fast catch-up threshold / range | **5000 / 5000** | code defaults |
| Live overlay | enabled; poll 1000 ms; maxCatchup 512 | code + health `liveLagBlocks` |
| WS | **`ws_connected: true`** | health |
| Watchlist size | **6** | health |
| RPC error rate | **0** | health |
| Indexing enabled | true | live checkpoint advancing |

Code default for fixed-lag if env unset is **16** (`DEFAULT_FIXED_LAG_BLOCKS`); production overrides to **64**.

---

## 6. Canonical confirmation logic

**Implementation:** `apps/indexer/src/live/targetHead.ts` → `resolveTargetHead`.

```text
fixed-lag: targetHead = latest - SCOOP_CONFIRM_LAG_BLOCKS  (64 in prod)
```

Runner (`apps/indexer/src/live/runner.ts`) refuses `nextBlock > targetHead`.

**Same gate for:** launches, swaps, transfers, holder balance writes, candles, market-state refresh — all inside `processBlock` only after the block is ≤ target.

**Not gated by block tags for ingest:** `safe` / `finalized` still fetched each loop for `confirmation_status` labels / promotion only. They do **not** set the ingest tip under `fixed-lag`.

**Nothing waits longer than 64 for ingest eligibility** under current mode. Accounting promotion to `confirmed`/`finalized` labels can lag further (safe ≈ **5k–7k+** blocks behind tip today) but does not delay row visibility for market UI.

---

## 7–8. Measured RHC block time & 64-block floor

| Metric | Value |
| --- | ---: |
| Consecutive 30-block sample | **0.10 s/block** (min 0, max 1 — coarse timestamps) |
| Implied rate | **~10 blocks/s** |
| Avg txs/block (sample) | ~14 |
| **64-block wall-clock floor** | **~6.4 s** |
| 32 / 16 / 8 floors | ~3.2 / 1.7 / 0.8 s |

---

## 9–12. Main loop / idle / catch-up / batch

```text
advisory lock → start live overlay (concurrent)
loop:
  getBlockNumber + safe + finalized
  target = latest - 64
  next = checkpoint + 1
  if next > target:
      promote / quote snapshot / 24h sweep / health
      sleep POLL_INTERVAL_MS (2000) or WS wake
  else:
      if lag > 5000: fast range catch-up (5000-block spans)
      else: process up to MAX_BLOCK_BATCH (20) blocks serially via processBlock
      (no sleep while behind)
```

| Behavior | Detail |
| --- | --- |
| Idle | Sleep **only** when caught up to target |
| Behind | **No** inter-batch sleep |
| Max live batch | **20** |
| Fast path | Only if lag **> 5000** — moderate lag (100–500) still uses slow per-block path |
| Live overlay | Same process, separate RPC client, shared DB pool — contention possible, not a hard await |

---

## 13. Sustainable blocks/sec (critical)

| Path | Measured / inferred |
| --- | --- |
| Chain production | **~10 blk/s** |
| Live observer | typically **tip−30–90** (~3–9 s); often recovers to near 0 lag |
| Canonical `processed_blocks` active seconds | often **~3–6 rows/s** |
| 3-minute window after deploy | 191 processed rows spanning **1721** blocks in **159 s** (empty spans advance without one row per block) |
| Steady samples | checkpoint repeatedly **~210–570 blocks behind target** (~**21–57 s** of chain time) |

**Finding:** with `max batch = 20` and per-block `getBlock`+`getLogs`(+ N+1), canonical live-mode throughput does **not** comfortably exceed chain production. Small deploy/RPC hiccups therefore leave the site delayed for **tens of seconds to minutes**, not just the 6.4 s confirm floor.

---

## 14–15. RPC map & event fetch

### Per loop (always, serial)

1. `eth_blockNumber`
2. `eth_getBlockByNumber(safe)`
3. `eth_getBlockByNumber(finalized)`

### Per live block (`processBlock`)

1. `getBlock(blockNumber)`
2. **One** `getLogs` for `[factory, poolManager, creatorRewards, watchlist tokens, distributors, holder vaults]` for that single block
3. **Per TokenLaunched (N+1):** receipt + tx + parallel metadata (`readContract` × ~9) + `getLaunch`
4. **Per Swap (N+1):** `getTransaction` (orientation / sender)
5. Transfers: no extra RPC

### Fast catch-up

- Range `getLogs` **without** PoolManager to find interesting blocks
- Then full `processBlock` (including PoolManager logs) per interesting block
- Empty spans: sparse block anchors

**Duplicate work:** fast path may fetch logs twice (range probe + per-block full filter). Live path is single getLogs per block but pays N+1 on swaps/launches.

---

## 16. Decode / classification

CPU cost is secondary to RPC. Work includes buy/sell orientation, quote amounts, USD via quote snapshots, FDV from sqrt mark. Metadata hydration on launches is the heavy decode-adjacent cost (many `readContract`s). No per-block timing logs on canonical loop (unlike live observer’s `rpcMs/decodeMs/writeMs`).

---

## 17–18. DB write map & timing

**Txn boundary:** one DB transaction per `processBlock` (checkpoint advanced in same txn).

| Event | Writes |
| --- | --- |
| Launch | raw events, creator, token, launch, pool, optional trade, transfers, holder_balances, token_market_state, candles (+ rollups), address class; optional display-image enrichment |
| Swap | raw, trade, pool, candles, `refreshTokenMarketFromTrades` → token_market_state |
| Transfer | raw, transfers, `applyHolderTransfer` → holder_balances (**does not** refresh holder counts on market state) |

Trade `created_at − block_timestamp` samples (recent): **~11–17 s** typical; one post-launch follow-up buy **~29 s**.

---

## 19. Holder path

```text
Transfer log (watchlist) → holder_balances upsert/delete
holder_count_* in token_market_state ← refreshTokenMarketFromTrades (swap / launch / 24h sweep)
UI holder count ← token detail poll (2s) reading token_market_state
/holders list API exists but unused in UI
```

**Holders can lag trades:** balance row updates on transfer ingest; **count** updates mainly when a swap refreshes market state. Pure transfer without swap leaves counts stale until next refresh/sweep.

---

## 20. Trade / volume / FDV

All primarily **write-time materialized** in `token_market_state` / `trades` (not recomputed in APIs).  
24h volume aged by idle sweep (`SCOOP_VOLUME_24H_SWEEP_SECONDS=60`).  
After DB insert, API delay ≈ poll (≤2 s) — **not** CDN cache on core market routes.

---

## 21. Candles / chart

Indexer writes `candles` synchronously in the swap/launch txn.  
**Product chart does not use that table** — `TokenPriceChart` rebuilds series from the **trades poll** (limit 100 seed / 200 rolling).  
`/api/tokens/[address]/candles` exists (`force-dynamic`) but is unused by production UI.

---

## 22. API path

| Route | Cache | Live merge |
| --- | --- | --- |
| token / trades / markets / discover | `force-dynamic`, no Cache-Control | yes |
| holders / candles | `force-dynamic` | no |
| protocol/stats | `s-maxage=20` | no |

SSR pages are canonical-only; first client poll merges live.

---

## 23. Frontend polling

| Surface | Interval |
| --- | ---: |
| Token metrics + trades + chart | **2000 ms** (shared) |
| Markets board | **2000 ms** |
| Discover | **2000 ms** |
| Protocol tape | **20000 ms** |
| Fresh launch gate | **2500 ms** |

Independent boards can show slightly different freshness.

---

## 24–31. Production health & timing samples

### Health timeseries (~60 s window starting 19:18:48Z, post-deploy)

| t (UTC) | tip−cp | behind target | live tip−live | notes |
| --- | ---: | ---: | ---: | --- |
| 19:18:48 | 220 | 156 | 93 | fast batch… |
| 19:19:09 | 294 | 230 | 58 | fast batch… |
| 19:19:29 | 471 | 407 | 91 | fast batch… (health stale) |
| 19:19:49 | 638 | 574 | 46 | fast batch… |
| 19:21:13 | 300 | **236** | 42 | notes “caught up” (stale vs cp) |
| 19:22:18 | 274 | **210** | 31 | notes “caught up”; rpc_error_rate 0 |

**Interpretation:** indexer is **healthy but chronically slightly/moderately behind target**, not permanently failed. `lag_blocks=0` in health is **misleading** when notes are from a brief catch-up heartbeat while checkpoint later drifts.

`safe` lag ≈ **5.3k–7.6k** blocks (~9–13+ minutes) — irrelevant to fixed-lag ingest tip.

### Recent launch (T110)

| Stage | Time |
| --- | --- |
| T0 mined | `2026-09-14T18:43:26Z` block `63029050` |
| T3 token row | `18:43:40.558Z` (**~14.6 s**) |
| Later buy mined | `18:45:41Z` block `63030407` |
| Buy trade created_at | `18:45:52.438Z` (**~11.4 s**) |

### Recent buys / sells

| Side | Example lag `created_at − mined` |
| --- | ---: |
| buy (T110) | 11.4 s |
| buy (2HAWK launch) | 16.5 s |
| buy (2HAWK follow-up) | 28.8 s |
| sell (MUSE era) | ~15–16 s |

### Holder-change

T110 user holder row `updated_at` matches buy trade ingest (`18:45:52.438Z`) — same block pipeline as the swap, not a separate delayed worker.

---

## 32. Live-overlay contention

| Factor | Assessment |
| --- | --- |
| Same process | yes |
| Shared DB pool | yes — possible connection contention |
| Shared RPC URL class | yes (separate clients) — rate-limit contention |
| Blocks canonical await? | no (fire-and-forget) |
| Evidence | live stays much closer to tip than canonical → overlay is not the primary canonical lag; it may steal some RPC budget |

---

## 33. Render resources

- Worker on Render starter blueprint; single instance observed.  
- No OOM/restart evidence in this audit window beyond normal deploy cutover at `19:17–19:18Z`.  
- Post-deploy lag spike (tip−cp up to 638) consistent with lock handoff + catch-up slower than tip.  
- Resource size may contribute under N+1 RPC load but **algorithmic batch/RPC shape is the clearer bottleneck**.

---

## 34. Supabase / DB

- Indexer uses pooled `DATABASE_URL` + dedicated lock DB URL (pattern from docs).  
- Writes are many sequential upserts inside one txn per block — fine at low token count (watchlist 6), will scale poorly with more markets if N+1 RPC remains.  
- No lock/slow-query dashboard pulled this pass; trade ingest latency samples do not show multi-minute DB stalls.

---

## 35. Unavoidable vs avoidable

| Delay source | Current approx | Intentional? | Can reduce safely? |
| --- | ---: | --- | --- |
| 64-block confirmation | **~6.4 s** | yes | maybe (see §40) |
| Catch-up deficit vs tip (live-mode < chain rate) | **~20–60 s** typical in samples | **no** | **yes — Tier A** |
| Idle poll when at tip | 0–2 s | yes | yes (WS already helps) |
| Per-block RPC + swap N+1 | seconds/block when busy | no | yes |
| Decode/CPU | sub-second typical | no | low priority |
| DB writes | sub-second–low seconds | no | batch later |
| API | ~negligible | no | no need |
| Frontend poll | 0–2 s | product | yes later |
| Holder count refresh coupling | extra until next swap/sweep | no | yes (Tier B) |

---

## 36. Top 5 bottlenecks (ranked)

1. **Near-tip canonical throughput &lt; chain rate** (batch 20 + per-block logs; fast path only after 5000 lag)  
2. **64-block fixed lag** (~6.4 s floor)  
3. **N+1 `getTransaction` / launch hydration RPC**  
4. **Frontend 2 s poll** (after data is already in DB)  
5. **Holder counts tied to market refresh**, not transfer ingest  

---

## 37. Tier A — low risk / high value

1. **Raise moderate-lag ingest rate above 10 blk/s** — e.g. increase `SCOOP_MAX_BLOCK_BATCH`, and/or lower `SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS` into the hundreds, and/or use range `getLogs` for moderate lag without waiting for 5000.  
2. **Eliminate or batch swap `getTransaction` N+1** where orientation can be derived from logs/pool state.  
3. **Canonical loop timing logs** (`loopMs`, `rpcMs`, `blocks/sec`, `behindTarget`) matching live observer — observability only.  
4. Optional: reduce idle poll to 500–1000 ms (minor vs #1).  
5. Do **not** touch confirm=64 in the first pass.

---

## 38. Tier B — moderate

1. Keep presentation on live overlay for trades/price; extend **holder count / volume presentation** carefully without moving settlement.  
2. Refresh `holder_count_*` on transfer apply (or async) so holders match trade freshness.  
3. Provider WS-driven canonical wake already present — ensure it always arms after deploy.  
4. Consider confirm lag **32** only after catch-up is fixed and reorg evidence reviewed.

---

## 39. Tier C — larger (only if needed)

- Separate holder worker / read models  
- Kafka/Redis/Realtime — **not** justified by this audit  
- Dropping fixed-lag entirely back to `safe` would **worsen** UX (safe lag ~minutes)

---

## 40. 64-block recommendation

| Question | Answer |
| --- | --- |
| Seconds cost today? | **~6.4 s** floor at ~0.1 s/block |
| Risk protected? | Shallow reorg / unstable near-tip blocks; status labels still track RPC safe/finalized |
| Still justified on RHC? | **Yes as a safety buffer**, but it is **not** the dominant UX delay vs catch-up deficit |
| Would 32/16/8 help? | Saves ~3.2/4.7/5.6 s — **material only after** throughput is fixed |
| Evidence to reduce? | Measured reorg depth on RHC; time-at-risk with lag 32/16; no settlement coupling to confirmMode |
| Presentation &lt; 64 while accounting at 64? | **Already partially true** via live overlay for trades/markets; holders/FDV/canonical charts still wait |

**Do not change 64 in the next implementation phase.** Fix throughput first.

---

## 41–42. End-state estimates

| Surface | Current (measured/est.) | After Tier A | Aggressive (A+B, lag 32) |
| --- | ---: | ---: | ---: |
| Trades UI (canonical) | **~15–45 s** (11–29 s samples + backlog) | **~8–15 s** | **~5–10 s** |
| Trades UI (live overlay) | **~1–5 s** typical | same | same |
| Volume / price / FDV | tracks canonical (~15–45 s) | ~8–15 s | ~5–12 s |
| Holders (count) | ≥ trade lag; can be longer w/o swap refresh | ~trade lag | ~trade lag |
| Accounting-safe (64) | ≥6.4 s + process | ≥6.4 s + faster process | if lag reduced, policy decision |

---

## 43. Next implementation phase

**Phase: “Canonical near-tip throughput” (Tier A only).**

Ship config/code so sustained `blocks_processed/sec` while behind **exceeds ~12**, prove `behindTarget` stays near **0–20** for 30+ minutes, add loop metrics, **leave confirm lag at 64**. Then re-evaluate confirm 32 and holder-count freshness.

---

## 44. Confirmation

**No production changes were made** in this audit (read-only RPC/DB queries + Render CLI list only).

---

**Recommended next action:** implement Tier A near-tip catch-up throughput (batch/range ingest + cut swap N+1 RPC) while keeping 64-block confirmation, because production checkpoints repeatedly sit ~200+ blocks behind target despite a healthy worker and a confirm floor of only ~6.4 seconds.
