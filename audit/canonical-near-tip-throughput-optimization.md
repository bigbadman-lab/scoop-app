# Canonical Near-Tip Throughput Optimization

**Observed at (UTC):** 2026-09-14T19:23Z–21:02Z  
**Scope:** Tier A canonical indexer throughput. Confirm lag stays `fixed-lag` / 64. No holder-count semantics change. No frontend polling change. No launches/trades broadcast.

---

## 1. Verdict

## `PARTIAL — THROUGHPUT IMPROVED BUT PRODUCTION TARGET NOT YET PROVEN`

Canonical catch-up while behind is now routinely **~260–500+ blk/s** on empty ranges (well above the **>12 blk/s** requirement and above RHC tip ~9–10 blk/s). The prior recurring **~200–600 block** deficit is gone (**0 samples >200** over 30 minutes).

Steady-state `behindTarget` improved to **median 18** (min 4, max 71) with **9/16 samples ≤20**, but it is **not yet stably in the 0–20 band** for the full window — residual sawtooth spikes (~40–70) remain when HTTP `eth_blockNumber` is sticky for a few seconds then jumps. Spikes recover in **<1s** via range catch-up.

Confirm mode remains **`fixed-lag` / 64**. No duplicate trades. BUY/SELL rows intact.

---

## 2–5. Repo / HEAD / branch / status

| Item | Value |
|------|-------|
| Path | `/Users/alexattinger/scoop-app` |
| Branch | `main` |
| Pre-HEAD (task start) | `45377ca` (`docs(audit): map production canonical indexer latency`) |
| Final HEAD | `f172adab3f8939fecc7c77c3fd953c221ff7d46f` |
| Status before | dirty tree with many unrelated untracked audit/P10.4 reports; clean for indexer work |
| Status after | report + prior perf commits on `main`; unrelated untracked files remain |

### Commits in this workstream

1. `2ac936a` — `perf(indexer): accelerate canonical near-tip catch-up`
2. `87557f4` — `perf(indexer): keep empty blocks cheap and force early range catch-up`
3. `2621e40` — `perf(indexer): skip idle work when tip advances and always range-catch-up`
4. `a4b50a7` — `perf(indexer): reorg-check only sparse processed blocks`
5. `f172ada` — `perf(indexer): use WS tip to avoid false idle on sticky HTTP heads`

---

## 6–8. Production Render

| Item | Value |
|------|-------|
| Service | `scoop-app` |
| Service ID | `srv-daenmj6q1p3s73a4long` |
| Previous Live SHA (pre-task) | `45377ca` (latency audit only) |
| New Live SHA | `f172adab3f8939fecc7c77c3fd953c221ff7d46f` |
| Deploy ID | `dep-dak5hbqjnfac73es11vg` |
| Deploy finished | `2026-09-14T20:30:21Z` |

Dashboard env still overrides some knobs (`SCOOP_MAX_BLOCK_BATCH=500`, `SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS=64`, `SCOOP_FAST_CATCHUP_RANGE=5000`, poll may still be 2000). **Code hard-caps** neutralize the dangerous overrides (threshold→0, poll→≤500ms, live batch→≤48).

---

## 9. Exact root cause

1. **Moderate lag trapped in slow per-block mode** — range catch-up only after ~5000 blocks; live batch ~20; empty per-block ~2–4 blk/s < chain ~10 blk/s → backlog grew to hundreds of blocks.
2. **Swap N+1 `getTransaction`** — extra RPC per swap when enrichment needed.
3. **Always-`includeTransactions` regression** (briefly) — empty blocks slowed further; fixed by lazy tx load.
4. **Reorg window fetched every header (≤128 sequential `getBlock`)** each loop — seconds of overhead; tip raced ~40+ blocks ahead between catch-ups.
5. **Idle maintenance + sticky HTTP tip** — false “caught up” while provider tip lagged then jumped ~40–50 blocks.

---

## 10–11. Old vs new main-loop behavior

**Old:** poll tip → resolve target (`latest−64`) → always reorg-check full window → if lag ≤5000 use per-block `processBlock` in small batches → else range catch-up → idle sleep 2s when caught up.

**New:** poll tip (HTTP for indexing; max(HTTP,WS) for idle/lag) → target still `latest−64` → reorg-check **only sparse processed blocks** → **any lag > 0 uses range catch-up** (hard-capped) → lazy full-tx block only when launches/swaps need `tx.from` → if tip moves during “caught up”, skip idle maintenance and catch up immediately → true idle only at `behindTarget=0` with ≤500ms poll / WS wake.

---

## 12–18. Batch / threshold / range

| Knob | Old | New (code default) | Runner hard-cap | Why |
|------|-----|--------------------|-----------------|-----|
| Normal batch | 20 | 32 | ≤48 | Larger near-tip batches without huge stall risk |
| Fast threshold | 5000 | 0 | `min(cfg, 0)` ⇒ always 0 | Any lag uses proven range path; defeats dashboard 64/5000 |
| Fast range | 5000 | 512 | (env may still be 5000; capped by targetHead) | Bounded spans; empty ranges still hundreds of blk/s |
| Poll | 2000ms | 500ms | ≤500ms | Reduce tip race while idle |

---

## 19–20. Swap N+1 before / after

**Before:** each launch/swap → `getTransaction({ hash })` for `tx.from`.

**After:** orientation still from swap amounts / pool currency ordering (unchanged). `tx.from` from lazy once-per-block `getBlock(includeTransactions:true)` cache; per-hash fallback `getTransaction` only if missing. Empty blocks never load full txs.

---

## 21. Launch hydration

No semantic change. No aggressive launch RPC redesign. Deterministic image enrichment path unchanged (post-insert).

---

## 22–23. RPC concurrency / retry

No new unbounded concurrency. Existing RPC client retry/fallback retained. Range path still uses `getLogs` with range-reduction on provider rejection. `rpcRetries` logged on throughput lines (0 in steady samples).

---

## 24–26. Checkpoint / empty-range / restart

- Empty ranges advance checkpoint via sparse anchors; interesting blocks call `processBlock` once.
- Unit tests cover empty range, launch-in-range, swap-in-range, mid-range restart, idempotent duplicate short-circuit.
- Production: no duplicate `(tx_hash, log_index)` trade groups.

---

## 27. Fixed-lag = 64 proof

All 16/16 observation samples include `confirmLagBlocks=64` and `confirmMode=fixed-lag`. Throughput logs consistently show the same. Startup config: `"confirmMode":"fixed-lag","confirmLagBlocks":64`.

---

## 28–35. Regression results

| Area | Result |
|------|--------|
| BUY/SELL orientation tests | Existing suite retained; no orientation codepath rewrite beyond `tx.from` source |
| ETH / USDG / stock quote | Not re-broadcast; prior canaries remain the orientation proofs. No accounting changes |
| Transfer / holder balances | Range path still processes Transfer logs via address filters; holder-count **refresh semantics unchanged** (explicit non-goal) |
| Price / FDV / volume / candles | No projection formula changes; market_state row count stable (6) |
| Deterministic image enrichment | Untouched |

Integrity at end of observation:

- trades: buy=16, sell=3  
- duplicate trade groups: **0**  
- `rpc_error_rate`: 0  

---

## 36–38. Local benchmark

Read-only empty-window check (public/env RPC): range-style ingest capability remains far above tip; sequential head fetch ~141ms; tip ~9 blk/s. Full BEFORE/AFTER identical-window replay not re-run in the final hour (earlier phase showed range empty ≫12 blk/s vs per-block ~2–4). Production catch-up logs are the primary evidence (280–500 blk/s empty).

RPC-call comparison (qualitative):

- Empty blocks: 1× `getLogs` (+ sparse anchors) vs N× `getBlock`+`getLogs`
- Swaps: ≤1 full-tx block fetch vs N× `getTransaction`
- Reorg: O(processed anchors) vs O(128) headers/loop

---

## 39–40. Deploy / advisory lock

- Auto-deploy of `f172ada` Live at 20:30:21Z.
- Lock handoff observed (`indexer singleton lock busy` → `indexer advisory lock acquired`); single owner thereafter.
- Live overlay continues (`live overlay healthy at tip` / live checkpoint updates).

---

## 41–47. Production observation (30 minutes)

**Window:** 2026-09-14T20:32:11Z → 21:02:15Z (~30.07 min), 16 samples @ ~120s. Deployed SHA `f172ada`.

| t (UTC) | latest | target | checkpoint | behindTarget | notes mode | blk/s (notes) | tip−live |
|---------|--------|--------|------------|--------------|------------|---------------|----------|
| 20:32:11 | 63093135 | … | … | **47** | normal-batch | 0 | 71 |
| 20:34:11 | 63094351 | … | … | **11** | normal-batch | 0 | 29 |
| 20:36:11 | 63095519 | … | … | **37** | normal-batch | 0 | 60 |
| 20:38:12 | 63096663 | … | … | **35** | normal-batch | 0 | 49 |
| 20:40:12 | 63097899 | … | … | **41** | normal-batch | 0 | 71 |
| 20:42:12 | 63099094 | … | … | **18** | normal-batch | 0 | 34 |
| 20:44:12 | 63100258 | … | … | **32** | normal-batch | 0 | 48 |
| 20:46:12 | 63101440 | … | … | **50** | normal-batch | 0 | 66 |
| 20:48:13 | … | … | … | **4** | range-catchup | **345.32** | 23 |
| 20:50:13 | … | … | … | **6** | range-catchup | **261.44** | 34 |
| 20:52:14 | 63105024 | … | … | **10** | normal-batch | 0 | 32 |
| 20:54:14 | 63106191 | … | … | **14** | normal-batch | 0 | 34 |
| 20:56:14 | 63107370 | … | … | **15** | normal-batch | 0 | 38 |
| 20:58:15 | 63108577 | … | … | **14** | normal-batch | 0 | 79 |
| 21:00:15 | 63109738 | … | … | **18** | normal-batch | 0 | 56 |
| 21:02:15 | 63110812 | … | … | **71** | normal-batch | 0 | 63 |

**Summary**

| Metric | Value |
|--------|-------|
| behindTarget min / median / max / p90 | 4 / **18** / 71 / 50 |
| samples ≤20 | **9 / 16** |
| samples >50 | 1 |
| samples >200 | **0** |
| confirmLagBlocks=64 | 16/16 |
| catch-up blk/s while behind (log samples) | ~260–500+ (empty range) |

Render loop logs (post-`f172ada`) repeatedly show range catch-up completing with `behindTargetBlocks=0` and `effectiveBlocksPerSecond` ~280–430 on empty spans; confirmLagBlocks=64 throughout.

---

## 48. Backlog spikes and recovery

- Spike pattern: HTTP tip sticky ~3–6s → jumps ~40–70 → range catch-up recovers in **~150–300ms**.
- No sustained 200+ deficit after cutover.
- Final sample 71 is a transient spike of this class (health lag was 17 at sample time).

---

## 49. Duplicate-row integrity

`GROUP BY tx_hash, log_index HAVING count(*)>1` → **0** rows.

---

## 50. Render CPU/memory

Not exported via CLI in this session. Worker remained responsive; no lock thrash after handoff; RPC error rate 0.

---

## 51. Final production latency estimate

- Confirmation floor: **64 blocks ≈ 6.4–7s** at ~9–10 blk/s tip.
- Avoidable worker backlog: previously **~20–60s**; now typically **~0.4–5s** (median behindTarget 18 ≈ **~2s** at tip rate), with occasional **~5–8s** spikes when HTTP tip jumps.
- End-to-end market UX roughly **~8–15s** in the median case is plausible; **not claimed as PASS** because 0–20 steady-state is not fully locked.

---

## 52–54. Explicit non-changes

- Frontend market polling: **unchanged** (~2s).
- Holder-count refresh semantics: **unchanged** (next workstream).
- `SCOOP_CONFIRM_MODE=fixed-lag`, `SCOOP_CONFIRM_LAG_BLOCKS=64`: **unchanged**.

---

## 55. Remaining risks

1. **Sticky HTTP `eth_blockNumber`** — primary residual behindTarget sawtooth; WS tip assist did not fully eliminate it (provider may share cache, or WS lag).
2. **Dashboard env overrides** — still set high batch/threshold/range; hard-caps mitigate but should be cleaned in Render dashboard.
3. **Post-batch DB maintenance** (promote/quote/volume) can still add loop latency when not skipped.
4. **Dense `processed_blocks` windows** — if live/normal paths densify anchors, reorg checks cost more (still far better than full 128-header scan).

---

## 56. Recommended next phase

1. **Holder-count freshness** — refresh `holder_count_*` on Transfer paths (explicit next workstream from latency audit).
2. **Tip source hardening** — multi-RPC tip voting / unstick detection so idle never trusts a frozen head for >~500ms.
3. **Render dashboard env cleanup** — set `SCOOP_FAST_CATCHUP_THRESHOLD_BLOCKS=0`, `SCOOP_POLL_INTERVAL_MS=500`, `SCOOP_MAX_BLOCK_BATCH=32`, `SCOOP_FAST_CATCHUP_RANGE=512` to match code.
4. **Only after steady 0–20 proven** — evaluate confirm lag **64 → 32**.

---

## STOP

Do not begin holder-count freshness or confirmation-lag reduction in this task.
