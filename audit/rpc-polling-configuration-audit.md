# RPC Polling Configuration Audit

**Date:** 2026-09-17  
**Scope:** Read-only — how Robinhood Chain RPC polling intervals are controlled  
**Verdict:** `CODE CHANGE REQUIRED`

---

## Short verdict

**`CODE CHANGE REQUIRED`**

`SCOOP_POLL_INTERVAL_MS` exists and is env-driven, but the live runner **hard-caps idle sleep at 500ms**. Setting `SCOOP_POLL_INTERVAL_MS=10000` alone still resolves to `Math.min(10000, 500) = 500`. A second independent RPC loop (`SCOOP_LIVE_POLL_MS`, default 1000ms) is unaffected by that env var.

**Current effective main idle poll: 500ms (0.5s).**

**Safest minimal next step:** Raise or remove the hard-cap in `apps/indexer/src/live/runner.ts`, then set env (and separately decide overlay cadence via `SCOOP_LIVE_POLL_MS` / `SCOOP_LIVE_OVERLAY_ENABLED`). Do not expect a 10s idle alone to be tip-safe on RHC without WS wake / lag review.

---

## 1. How is the main interval controlled?

**Combination of both** — environment variable **plus** a hardcoded hard-cap in code.

| Layer | Control | Effective behavior |
| --- | --- | --- |
| Env / schema | `SCOOP_POLL_INTERVAL_MS` | Parsed in config; code default **500** |
| Runtime | `Math.min(config.SCOOP_POLL_INTERVAL_MS, 500)` | Idle sleep **never exceeds 500ms** |

---

## 2. Current polling interval

| Context | Value |
| --- | --- |
| Code default (`config.ts`) | **500ms** |
| Render deploy (`render.yaml`) | **500ms** |
| `.env.example` (stale vs runtime) | **2000ms** — ignored by hard-cap anyway |
| **Effective idle-at-tip sleep** | **≤ 500ms** |

Idle sleep applies **only when caught up** to tip. While behind tip, the runner does continuous catch-up with **no** inter-batch sleep based on this interval.

---

## 3. Exact locations

### Primary config

| Item | Value |
| --- | --- |
| File | `apps/indexer/src/config.ts` |
| Env var | `SCOOP_POLL_INTERVAL_MS` |
| Schema | `z.coerce.number().int().positive().default(500)` |
| Default / fallback | **500** |

```76:76:apps/indexer/src/config.ts
    SCOOP_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(500),
```

### Where it is applied (hard-cap)

| Item | Value |
| --- | --- |
| File | `apps/indexer/src/live/runner.ts` |
| Expression | `Math.min(config.SCOOP_POLL_INTERVAL_MS, 500)` |
| Hardcoded max | **500** |

```567:574:apps/indexer/src/live/runner.ts
        await Promise.race([
          // Hard-cap idle poll so a dashboard override of 2000ms cannot let tip
          // race ~40+ blocks ahead between wakes (RHC often ≥10–20 blk/s).
          new Promise((r) =>
            setTimeout(r, Math.min(config.SCOOP_POLL_INTERVAL_MS, 500)),
          ),
          wakePromise,
        ]);
```

### Deploy / example sources

| Source | `SCOOP_POLL_INTERVAL_MS` |
| --- | --- |
| `render.yaml` (lines 40–41) | `"500"` |
| `.env.example` (line 71) | `2000` |
| Docs (`docs/RENDER_INDEXER_CHECKLIST.md`) | still says default `2000` — **stale** |

### Optional WS wake (not an interval setter)

If `ROBINHOOD_WS_URL` is set, `watchBlockNumber` can wake the loop earlier than the idle timer (`runner.ts` ~197–227). That can **increase** wake frequency relative to the poll timer; it does not enable a 10s env-only slowdown.

---

## 4. Can env alone move general polling to ~10 seconds?

**No.**

| Blocker | Detail |
| --- | --- |
| Hard-cap | Any env value > 500ms is clamped to 500ms |
| Second RPC poller | Tip overlay uses `SCOOP_LIVE_POLL_MS` (default **1000**), independent of `SCOOP_POLL_INTERVAL_MS` |
| Catch-up path | Behind tip → continuous RPC; poll interval irrelevant |
| Tip-safety | Even after removing the cap, 10s idle on RHC (~10–20 blk/s) can allow ~100–200 blocks of tip race between polls unless WS wake is healthy |

---

## 5. Other independent Robinhood RPC pollers / recurring RPC users

### A. Continuous / timer-driven (indexer process)

| # | Poller | Interval | Env / constant | Default | Hits RHC RPC? | Path |
| --- | ---: | --- | --- | ---: | --- | --- |
| 1 | Canonical live runner idle sleep | ≤500ms | `SCOOP_POLL_INTERVAL_MS` + hard-cap 500 | 500 | Yes — loop: `getBlockNumber`, safe/finalized; behind tip: getLogs / processBlock | `apps/indexer/src/live/runner.ts` |
| 2 | WS block wake | per new block | `ROBINHOOD_WS_URL` | unset = poll-only | Yes — WS subscription | `runner.ts` ~197–227 |
| 3 | Live tip overlay observer | tip: `SCOOP_LIVE_POLL_MS`; error: `max(SCOOP_LIVE_POLL_MS, 2000)`; catch-up: **no throttle** | `SCOOP_LIVE_POLL_MS`, `SCOOP_LIVE_OVERLAY_ENABLED` | 1000ms, enabled `true` | Yes — `getBlockNumber` + range observe | `apps/indexer/src/live/tipOverlay/observer.ts` |
| 4 | Quote USD snapshots | every N seconds on loop ticks | `SCOOP_QUOTE_SNAPSHOT_SECONDS` | **60s** | Yes — oracle `readContract` / `getPriceUsd` | `quoteSnapshot` via `runner.ts` |
| 5 | 24h volume sweep | every N seconds on loop ticks | `SCOOP_VOLUME_24H_SWEEP_SECONDS` | **60s** | **No RPC** (DB-only) | `runner.ts` |

Overlay tip wait (no hard-cap like the main runner):

```448:464:apps/indexer/src/live/tipOverlay/observer.ts
      // Never throttle catch-up. Poll only after reaching the observed tip.
      if (fromBlock > latest || toBlock >= latest) {
        await wait(config.SCOOP_LIVE_POLL_MS, signal);
      }
    } catch (error) {
      ...
      await wait(Math.max(config.SCOOP_LIVE_POLL_MS, 2_000), signal);
```

`SCOOP_LIVE_POLL_MS` is **not** set in `.env.example` or `render.yaml` — only the code default **1000**.

### B. Cron / one-shot workers (RPC when invoked; not continuous pollers)

| Service | Cadence | RHC RPC? | Notes |
| --- | --- | --- | --- |
| fee-keeper | Intended cron (~15m window) | Yes | One-shot process |
| holder-rewards-worker | Documented cron-style | Yes (canonical-production) | One-shot |
| news ingest | Render cron `*/15` | No | — |
| Vercel crons | `*/2` reconcile routes | No chain RPC in those routes | `apps/web/vercel.json` |

### C. Frontend / API “pollers” — mostly **not** Robinhood RPC

These poll SCOOP HTTP/DB APIs (hardcoded constants). Changing them does **not** reduce indexer RHC RPC spend:

| Constant | Interval | Target | File |
| --- | ---: | --- | --- |
| `MARKETS_LIVE_POLL_MS` | 2000 | `/api/markets` | `apps/web/src/lib/markets/constants.ts` |
| `DISCOVER_LIVE_POLL_MS` | 2000 | discover API | `apps/web/src/lib/discovery/tabs.ts` |
| `TOKEN_MARKET_LIVE_POLL_MS` | 2000 | token detail/trades APIs | `apps/web/src/lib/token/live-market.ts` |
| `INDEXED_LAUNCH_POLL_MS` | 1000 | indexed-launch readiness (API/DB) | `apps/web/src/lib/launch/wait-for-indexed-launch.ts` |
| Claims/rewards lanes | 20000 | `/api/account/...` | `HolderRewardsLane.tsx`, `CreatorClaimsLane.tsx` |
| Live desk strip | 45000 | `/api/market/spot` | `LiveDeskStrip.tsx` |

Web `app/api/**` routes: no recurring Robinhood `getBlockNumber` loops found. SIWE may use RPC once for verification — not a timer poller. Browser wallet RPC (`NEXT_PUBLIC_ROBINHOOD_RPC_URL`) is session-driven (wagmi), not app-owned indexer cadence.

### D. Disabled indexer idle (not RPC)

`runDisabledIdleMode` heartbeat every **30_000ms** hardcoded — zero RPC when `SCOOP_INDEXING_ENABLED=false` (`apps/indexer/src/live/idle.ts`).

---

## Env var cheat sheet (indexer RPC cadence)

| Env var | Code default | Purpose | Alone set ~10s? |
| --- | ---: | --- | --- |
| `SCOOP_POLL_INTERVAL_MS` | 500 | Canonical idle sleep | **No** (hard-capped at 500) |
| `SCOOP_LIVE_POLL_MS` | 1000 | Tip overlay idle between tip polls | Yes for overlay only (no hard-cap); separate from main |
| `SCOOP_LIVE_OVERLAY_ENABLED` | true | Enable/disable overlay RPC loop | Disable reduces RPC; not “10s main poll” |
| `SCOOP_QUOTE_SNAPSHOT_SECONDS` | 60 | Oracle `readContract` cadence | Independent |
| `ROBINHOOD_WS_URL` | unset | Wake on new blocks | Speeds wakes; does not set 10s |

---

## Safest minimal next step (no implementation in this audit)

1. **Code:** In `apps/indexer/src/live/runner.ts`, replace or raise `Math.min(..., 500)` so `SCOOP_POLL_INTERVAL_MS` can actually mean `10000` — or introduce an explicit max env (e.g. `SCOOP_POLL_INTERVAL_MAX_MS`) instead of a silent clamp.
2. **Env (after that deploy):** set `SCOOP_POLL_INTERVAL_MS=10000` on the Render indexer.
3. **Separately decide overlay:** set `SCOOP_LIVE_POLL_MS=10000` and/or `SCOOP_LIVE_OVERLAY_ENABLED=false` if the goal is total RPC rate reduction.
4. **Do not** expect frontend `*_LIVE_POLL_MS` changes to reduce Robinhood RPC — they hit app APIs.
5. Prefer keeping WS wake if slowing HTTP poll, or accept multi-second tip lag; validate against RHC block rate before production.

---

## Out of scope / not done

- No code changes
- No `.env` updates
- No commits
