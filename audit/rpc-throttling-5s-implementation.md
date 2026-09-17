# RPC Throttling — 5s Production Update

**Date:** 2026-09-17  
**Verdict:** `PASS`

---

## Git

| Item | Value |
| --- | --- |
| Pre-HEAD | `c8066651d3cee56e5ef10f120da56cf1414b70ed` |
| Final HEAD | `196e55d1f43a6f03bbeb213f2e8a147c70a3d771` |
| Commit SHA | `196e55d1f43a6f03bbeb213f2e8a147c70a3d771` |
| Deployed | **No** — nothing deployed to Render/Vercel |
| Broadcast | **No** — no transactions |

---

## What changed

Idle-at-tip Robinhood RPC polling for both the canonical live runner and the tip overlay is now **5000ms**, with the 500ms hard-cap removed. Catch-up paths remain unthrottled.

### Before → after

| Loop | Before | After |
| --- | --- | --- |
| Canonical idle-at-tip | `Math.min(SCOOP_POLL_INTERVAL_MS, 500)` → effective **≤500ms** | `SCOOP_POLL_INTERVAL_MS` → **5000ms** (no clamp) |
| Tip overlay idle | `SCOOP_LIVE_POLL_MS` default **1000ms** | default / Render / example **5000ms** |
| Behind tip (canonical) | continuous catch-up, no poll sleep | **unchanged** |
| Behind tip (overlay) | wait only after reaching tip | **unchanged** |
| Overlay enabled | `true` | **still `true`** |

### Resolved intended values

| Env | Code default | `render.yaml` | `.env.example` |
| --- | ---: | ---: | ---: |
| `SCOOP_POLL_INTERVAL_MS` | **5000** | **5000** | **5000** |
| `SCOOP_LIVE_POLL_MS` | **5000** | **5000** | **5000** |
| `SCOOP_LIVE_OVERLAY_ENABLED` | **true** | **true** | **true** |

---

## Files changed

- `apps/indexer/src/live/runner.ts` — removed hard-cap; idle sleep uses `config.SCOOP_POLL_INTERVAL_MS`
- `apps/indexer/src/config.ts` — defaults `5000` / `5000`
- `apps/indexer/src/config.test.ts` — expect new defaults
- `apps/indexer/src/live/live.test.ts` — expect new defaults
- `apps/indexer/src/live/pollTiming.test.ts` — **new** focused proofs (no clamp, idle-only sleep, overlay tip wait)
- `render.yaml` — `SCOOP_POLL_INTERVAL_MS=5000`, add overlay env keys
- `.env.example` — align poll + overlay values
- `docs/RENDER_INDEXER_CHECKLIST.md` — defaults updated
- `audit/rpc-throttling-5s-implementation.md` — this report

---

## Catch-up confirmation

- Canonical runner: `setTimeout(..., SCOOP_POLL_INTERVAL_MS)` only on the idle-at-tip branch (`continue` before lag/catch-up). No poll-interval sleep before `processFastCatchupRange`.
- Overlay: still `wait(SCOOP_LIVE_POLL_MS)` only when `fromBlock > latest || toBlock >= latest`; comment “Never throttle catch-up” preserved.
- Untouched: range sizing, checkpoints, reorg/finality, WS wake, quote snapshots, fee-keeper, holder rewards, news, frontend poll constants.

---

## Tests

```text
cd apps/indexer && pnpm test -- src/config.test.ts src/live/live.test.ts \
  src/live/pollTiming.test.ts src/live/fastCatchup.test.ts
→ 26 files / 158 tests passed

cd apps/indexer && pnpm typecheck
→ pass
```

Hidden clamp search: no remaining `Math.min(config.SCOOP_POLL_INTERVAL_MS` in runtime code.

---

## Remaining operational step (Render)

Repo/`render.yaml` now intend **5000**. If the live Render service has dashboard env overrides for `SCOOP_POLL_INTERVAL_MS` (previously `500`) or lacks `SCOOP_LIVE_POLL_MS`, update the Render dashboard to:

- `SCOOP_POLL_INTERVAL_MS=5000`
- `SCOOP_LIVE_POLL_MS=5000`
- `SCOOP_LIVE_OVERLAY_ENABLED=true`

Then redeploy/restart the indexer worker so the new image + env take effect. **This report did not deploy.**

---

## Rollback

1. Revert the commit (or restore `Math.min(..., 500)` and prior defaults).
2. Set Render env back to prior values if desired (`SCOOP_POLL_INTERVAL_MS=500`; overlay default was effectively 1000).
3. Redeploy indexer.

---

## Explicit non-actions

- No smart contract / protocol parameter changes  
- No frontend live-poll changes  
- No indexing or overlay disable  
- No secrets modified  
- No deploy, push, or broadcast  
