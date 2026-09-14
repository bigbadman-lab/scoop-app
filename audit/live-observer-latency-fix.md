# Live observer latency diagnosis + fix

**Date:** 2026-09-14  
**Verdict:** `PASS — LIVE OBSERVER NOW TRACKS NEAR TIP`

## Identity

| Field | Value |
| --- | --- |
| Pre-HEAD | `cb22765d7243041c6a40c12710d3c1e8814cb1ac` |
| Final HEAD / fix | `23a13fb9c2610821893619c2c7694ddb4edb8d37` |
| Branch | `main` |
| Git status before | clean tracked; unrelated untracked audits/`P10.4-*` |
| Canary token | `0x8292b1af08e0b2efbc0f383091d11ebed33bac5b` |
| Launch tx / block | `0x96af89673caa2ffcd60cd064b5dbe762c535106857a1ecd2e88f081e51c1dae8` / `62998239` |

## Production before fix

| Item | Value |
| --- | --- |
| Deployed SHA | `cb22765` live (observer from `2f30f53` lineage) |
| Observer enabled | yes |
| Poll / maxCatchup / TTL | 1000ms / **48** / 900s |
| RPC class | Alchemy Robinhood mainnet |
| Pre-fix live lag | **~8300–10700 blocks** behind tip |
| Catch-up rate | **48 blocks / ~8s ≈ 6 blk/s** (< chain ~10 blk/s) |
| Canonical | healthy tip−64; `confirmLagBlocks=64` |

## Startup sequence (code)

1. `runIndexer` logs start  
2. Acquire advisory lock (blocks until prior owner releases)  
3. Migration check + pool  
4. `startLiveTipOverlay` concurrent promise (after lock)  
5. Canonical loop loads watchlist and indexes  

Live does **not** run before lock.

## Initial / persisted checkpoint semantics (before fix)

- Resume persisted `live_observer_checkpoints` if present  
- Else use **canonical main checkpoint** (often tip−64+)  
- Advance ≤48 blocks/loop then **always sleep 1s**

## Exact cause of ~53s canary delay

Render log timeline:

| Time (UTC) | Event |
| --- | --- |
| 17:48:49 | Deploy `2f30f53` live |
| 17:49:09 | New runner starting (overlay enabled) |
| 17:49:10–17:50:17 | Advisory lock busy (~73s) |
| 17:50:22 | Lock acquired → overlay may start |
| 17:51:05 | T0 block ts for `62998239` |
| 17:51:21–17:51:34 | Canonical indexes launch (~16s from T0) |
| 17:51:58 | Live observes TokenLaunched (`latencyMs` ~53167) |

**Compound root cause:**

1. Overlay blocked on deploy lock handoff (~73s).  
2. After start, resumed **stale/canonical-behind** checkpoint, not near tip.  
3. **48/loop + sleep** yielded ~6 blk/s < chain ~10 blk/s → backlog grew; reaching `62998239` only at 17:51:58.

| Hypothesis | Verdict |
| --- | --- |
| Startup backlog | **Yes** (lock wait + stale resume) |
| Canonical starvation of overlay | **No** (concurrent after lock) |
| RPC alone | **No** as primary; loop slow but catch-up policy dominant |
| DB writes | **No** (writeMs ~0–3ms post-fix) |
| max-catchup=48 + sleep | **Yes** — permanent tip drift |

## Code changes

- `resolveLiveScanWindow`: jump if missing/stale CP (`lag > 256`) to `latest − 192`  
- Defaults: `maxCatchup=512`, `replayWindow=192`, `staleLag=256`  
- **No poll sleep while catching up**; sleep 1s only at tip  
- Structured `live-observer` logs; health notes `liveLagBlocks=N`  
- Canonical confirm lag **unchanged (64)**

## Post-deploy production proof

| Item | Evidence |
| --- | --- |
| Render deploy | `23a13fb` **live** finished `2026-09-14T18:34:42Z`; service restart cut over lock at `18:36:13Z` |
| Config | `liveMaxCatchupBlocks:512`, `liveReplayWindowBlocks:192`, `liveStaleLagBlocks:256` |
| Near-tip jump | `18:36:22Z` jumped lag **12046 → 0** (`scanFrom` tip−192 → tip) |
| Healthy at tip | `18:36:26`, `18:36:57` … `lagBlocks:0`, checkpoint==latest |
| Timing sample | jump `rpcMs=144`, `decodeMs=7233`, `loopMs=8020`; tip loops `loopMs≈2.3–3.3s`, `writeMs≤1` |
| Steady-state | Observer reports **0** lag at end of each loop; advances with tip continuously |
| Canonical | still fixed-lag 64 / `lag_blocks=0` vs target; health shows `liveLagBlocks=0` |

Note: comparing live CP to stale `indexer_health.chain_latest` can show negative lag; ground truth is observer `lagBlocks` / checkpoint==`latestBlock`.

## Tests / gates

- `scanWindow.test.ts` + config tests + indexer suite: pass  
- typecheck + build: pass  

## Confirmations

- No new service / Redis / WS / SSE / Realtime  
- No launch or trade broadcast  
- Canonical 64-block lag unchanged  

## Residual risks

- Deploy handoff still waits on advisory lock (inherent singleton); near-tip jump clears backlog after acquire  
- `decodeMs` can be multi-second on dense PoolManager log ranges — still finishes at tip each loop  
- Next full canary still needed for T0→T3 UX timing  

## Ready for Alex’s next full launch canary?

**Yes** — live observer tracks near tip in steady state without transaction.

---

**The live observer now tracks Robinhood Chain near tip in steady state without replaying a stale historical backlog. Canonical fixed-lag indexing remains unchanged. SCOOP is ready for one more Alex-authorized full launch canary to measure T0→T3 live UX latency.**
