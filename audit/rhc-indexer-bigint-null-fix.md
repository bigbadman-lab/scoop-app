# SCOOP — Phase 5A: BigInt(null) Crash Fix

## 1. Verdict

`PASS — BIGINT NULL CRASH FIXED AND READY FOR REDEPLOY`

---

## 2. Root cause

| Item | Detail |
|------|--------|
| File | `apps/indexer/src/live/projections/expire24hVolume.ts` |
| Function | `listMarketsNeeding24hRefresh` |
| Expression (pre-fix) | `BigInt(row.last_trade_sqrt ?? row.sqrt_price_x96)` (and sibling fields) |
| Null field(s) | When both last-trade and market curve columns are `null` (also liquidity / source block / opening sqrt), `??` yields `null` and `BigInt(null)` throws |

Exact error message matches production:

`Cannot convert null to a BigInt`

---

## 3. Why null occurs

- Post-batch path in `live/runner.ts` always runs `maybeExpireStale24hVolume` after a catch-up batch (when the 60s interval is due).
- On process start, `lastVolumeSweepAtMs = 0`, so the **first** completed batch always triggers the sweep.
- The SQL candidate query selects markets with non-zero materialized 24h fields.
- Some rows (sparse / Pump / incomplete `token_market_state`) can match that WHERE clause while `sqrt_price_x96`, `liquidity_raw`, `source_block`, and/or last-trade columns are still `null`.
- Candidate mapping called `BigInt(...)` **before** the per-market try/catch in `refreshStale24hMarketWindows`, so one bad row aborted the entire runner.

Why primarily after empty fast-catchup:

- Empty ranges still finish a batch and enter the post-batch health/sweep txn.
- Crash → process exit → Render restart → `lastVolumeSweepAtMs` resets to `0` → crash again after the next first batch.

Live-tip indexing would hit the same bug whenever the sweep interval elapses with a bad candidate present.

---

## 4. Fix implemented

In `listMarketsNeeding24hRefresh`, **skip** rows missing any required numeric/source fields instead of coercing them.

- Does **not** coerce null → `0n` (would invent fake curve state).
- Preserves existing skip for missing tx hash / log index.
- Valid complete rows still convert with `BigInt(...)`.

No changes to checkpoint, fixed-lag, fast-catchup range logic, overlay, Solana, or news.

---

## 5. Files changed

| Path | Change |
|------|--------|
| `apps/indexer/src/live/projections/expire24hVolume.ts` | Null-safe candidate mapping |
| `apps/indexer/src/live/projections/expire24hVolume.test.ts` | Repro + multi-batch survivor tests |
| `audit/rhc-indexer-bigint-null-fix.md` | This report |

---

## 6. Tests added

1. Exact null case: incomplete row previously would `BigInt(null)`; now skipped; complete sibling still selected.
2. Normal non-null case (existing test retained).
3. Post-batch sweep with only null candidates: `maybeExpireStale24hVolume` completes twice without throw (multi-batch survivor).

Related coverage retained: empty/range fast-catchup tests unchanged.

---

## 7. Test results

```text
pnpm --filter @scoop/indexer exec vitest run \
  src/live/projections/expire24hVolume.test.ts \
  src/live/fastCatchup.test.ts
```

**25 passed (25)** — expire24hVolume **8**, fastCatchup **17**.

---

## 8. Typecheck results

```text
pnpm --filter @scoop/indexer typecheck
```

**PASS**

---

## 9. Regression analysis

| Area | Status |
|------|--------|
| Reset checkpoint CLI / logic | **Unchanged** |
| Normal resume (`checkpoint + 1`) | **Unchanged** |
| Fixed-lag / `resolveTargetHead` | **Unchanged** |
| Fast catchup range size / threshold | **Unchanged** |
| Live overlay | **Unchanged** |
| Solana | **No changes** |
| News | **No changes** |

Static restart simulation after fix:

1. Resume from current checkpoint `68680918` → next `68680919`.
2. Complete empty/near-tip catch-up batch.
3. Post-batch volume sweep skips incomplete markets → **no throw**.
4. Loop continues to next batch until lag ≈ 64.
5. No path reopens the skipped historical gap (cursor still forward-only).

---

## 10. Production actions

| Action | Status |
|--------|--------|
| `scoop-app` resumed | **NO** |
| sibling workers resumed | **NO** |
| production DB mutated | **NO** |
| production env changed | **NO** |
| blockchain transaction | **NO** |
| historical RPC scan | **NO** |

---

## 11. Next step

`NEXT STEP: DEPLOY FIX, THEN RESUME RHC INDEXER ONLY AND VERIFY SUSTAINED MULTI-BATCH CATCH-UP TO ~64-BLOCK LAG.`

Do **not** deploy/resume in this phase.

Expected after deploy+resume:

- no `Cannot convert null to a BigInt`;
- multiple consecutive catch-up batches without process exit;
- lag settles near configured fixed-lag 64;
- siblings remain suspended until a later phase.

---

## Git / safety

| Item | Value |
|------|-------|
| HEAD (pre-commit) | `628239b18ff7b6e308401ecf08a57068d01ccea9` |
| Commit/push/deploy | **None** |
| Production workers | Remain suspended |

**Stop.**
