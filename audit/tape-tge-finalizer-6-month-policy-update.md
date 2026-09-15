# TAPE TGE Finalizer — 6-Month Lock Policy Update

## 1. Verdict

```text
PASS — TAPE DEV-BUY LOCK POLICY UPDATED TO 6 CALENDAR MONTHS
```

Deliberate pre-mutation policy change: **12 calendar months → 6 calendar months**. Phase 1 remains rehearsal-only; `--confirm` still hard-refuses.

---

## 2. UTC timestamp

**2026-09-15T12:21:52Z**

---

## 3. Repository state

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `964b3af5ae5d6ba766a3a14f0cfa03b91ec5c7ac` |
| Phase 1 tooling | Still uncommitted (preserved; not reset/stash) |
| Unrelated dirty/untracked | Preserved |

---

## 4. Files changed

| Path | Change |
|---|---|
| `scripts/lib/tge-constants.mjs` | Added `TGE_DEV_BUY_LOCK_CALENDAR_MONTHS = 6` |
| `scripts/lib/tge-unlock-policy.mjs` | Policy math uses canonical months; renamed check → `unlockSatisfiesDevBuyLockPolicy` |
| `scripts/lib/tge-finalize-rehearsal.mjs` | Preview duration + policy check import |
| `scripts/tge-finalize.test.ts` | 6-month calendar / margin / duplicate-lock / preview tests |
| `audit/tape-tge-finalizer-phase1-rehearsal.md` | Policy sections updated to 6 months |
| `audit/tape-tge-finalizer-6-month-policy-update.md` | This report |

No product/indexer/frontend/env changes. Not staged/committed/pushed.

---

## 5. Canonical policy before / after

```text
BEFORE: 12 calendar months
AFTER:  6 calendar months
```

```text
TGE dev-buy lock policy updated before mutation enablement:
12 calendar months -> 6 calendar months
```

Operator-facing rule:

```text
100% of the TAPE acquired in the launch dev buy
will be locked on-chain through HoodLock
for a minimum of 6 calendar months.
```

---

## 6. Implementation change

Single canonical constant:

```js
export const TGE_DEV_BUY_LOCK_CALENDAR_MONTHS = 6;
```

Used by `minimumUnlockUnixFromReference`, `proposeUnlockUnix`, and `unlockSatisfiesDevBuyLockPolicy`. No operator flag to shorten duration.

---

## 7. Calendar-month calculation

Still UTC calendar-month arithmetic with end-of-month clamp (not `180`/`182`/`183` days).

Verified examples:

| Input | +6 months |
|---|---|
| 2026-09-15 | 2027-03-15 |
| 2026-08-31 | 2027-02-28 |
| 2027-08-31 | 2028-02-29 |
| 2028-02-29 | 2028-08-29 |

---

## 8. Safety-margin behavior

Unchanged principle:

```text
propose:  unlock = addCalendarMonthsUtc(chainTs, 6) + 300s
prove:    recordedUnlock >= addCalendarMonthsUtc(lockBlockTs, 6)
```

Margin only protects construction against a slightly later mined timestamp.

---

## 9. Duplicate-lock qualification

Existing HoodLock locks must meet the **new** 6-month minimum (`minimumUnlockUnix` from policy). Shorter locks → `NOT_STARTED` (do not count as TGE-complete). Exact minimum and longer locks still qualify. Token/owner/amount/withdrawn/ambiguity rules unchanged.

---

## 10. Preview/operator UX

Preview now prints:

```text
Lock policy
  …
  Duration: 6 calendar months
```

CLI UX unchanged:

```bash
pnpm tape:tge-finalize 0xTAPE
pnpm tape:tge-finalize 0xTAPE --confirm   # still refused
```

---

## 11. Tests and results

```bash
pnpm test:tge-finalize
# 50 passed (43 finalizer + 7 set-contract verify)
# prior baseline: 44 passed
```

Also: `pnpm tape:tge-finalize --help` OK; live preview shows `Duration: 6 calendar months`.

---

## 12. Stale 12-month reference search

Active finalizer implementation has **no** functional 12-month lock requirement.

Remaining mentions (safe):

| Location | Why safe |
|---|---|
| `audit/tape-tge-finalizer-phase1-rehearsal.md` | Documents deliberate `12 → 6` change |
| This report | Same |
| `scripts/tge-finalize.test.ts` | Asserts preview does **not** contain `12 calendar months`; one helper sanity uses `+12` only to exercise month clamp |
| `codeSha256.slice(0, 12)` | Unrelated display truncation |

No other TGE-finalizer operator path still enforces 12 months.

---

## 13. `--confirm` hard-disable proof

```text
pnpm tape:tge-finalize 0x4B22…DD3C --confirm
→ exit 1
→ TAPE TGE FINALIZER — BROADCAST NOT ENABLED
→ Phase 1 is rehearsal-only.
→ No database or blockchain mutation has been performed.
```

---

## 14. Scope / no-mutation confirmation

No transactions, signatures, approvals, locks, private keys, DB writes, product edits, stage, commit, push, or deploy.

---

## 15. Final gate

```text
6-MONTH POLICY UPDATE PASSED — PHASE 1 REMAINS REHEARSAL-ONLY
```
