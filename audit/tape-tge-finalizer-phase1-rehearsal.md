# TAPE TGE Finalizer — Phase 1 Rehearsal Report

## 1. Verdict

```text
PASS — TAPE TGE FINALIZER REHEARSAL TOOLING READY FOR SECURITY REVIEW
```

Phase 1 delivers a read-only orchestrator (`pnpm tape:tge-finalize`) with separable primitives, hard `--confirm` disable, HoodLock code-hash pinning, **6-calendar-month** lock policy (`TGE_DEV_BUY_LOCK_CALENDAR_MONTHS`; updated from 12 before mutation enablement), and mock-covered state machine. No broadcast / DB write / signing path is reachable.

---

## 2. UTC timestamp

**2026-09-15T12:16:18Z**

---

## 3. Repository state / pre-HEAD

| Field | Value |
|---|---|
| Branch | `main` |
| HEAD | `964b3af5ae5d6ba766a3a14f0cfa03b91ec5c7ac` (matches freeze) |
| Unrelated dirty/untracked | Preserved (audits / P10.4 reports) |

---

## 4. Files changed

| Path | Role |
|---|---|
| `package.json` | `tape:tge-finalize`, `test:tge-finalize` scripts |
| `scripts/tge-finalize.mjs` | Operator CLI (rehearsal only) |
| `scripts/tge-finalize.test.ts` | Focused unit tests |
| `scripts/lib/env-local.mjs` | Shared `.env.local` loader |
| `scripts/lib/tge-constants.mjs` | Chain / HoodLock / factory constants |
| `scripts/lib/tge-unlock-policy.mjs` | 6 calendar-month math (`TGE_DEV_BUY_LOCK_CALENDAR_MONTHS`) |
| `scripts/lib/tge-token-model.mjs` | ScoopToken model classification |
| `scripts/lib/tge-identity.mjs` | Arg parse + hard TAPE identity |
| `scripts/lib/tge-protocol-settings-read.mjs` | Read-only DB classify / canonical transition |
| `scripts/lib/tge-dev-allocation.mjs` | Dev wallet rule + `InitialBuyExecuted` detection |
| `scripts/lib/hoodlock.mjs` | Code-hash verify, approve/lock encode, lock index |
| `scripts/lib/tge-finalize-rehearsal.mjs` | State machine + preview formatter |
| `audit/tape-tge-finalizer-phase1-rehearsal.md` | This report |

**Not modified:** `scripts/set-tape-contract.mjs`, product/frontend/indexer, `.env`.

**Not staged / committed / pushed.**

---

## 5. Existing `tape:set-contract` architecture

Unchanged CLI:

```text
pnpm tape:set-contract <0x> --confirm [--override]
```

Shared verify helpers remain in `scripts/lib/tape-contract-verify.mjs` (soft symbol). Finalizer adds a **stricter** identity path that requires `symbol === "TAPE"` and does **not** expose `--override` into the orchestrator.

Regression: `pnpm tape:set-contract --help` still works; shared verifier tests still pass (non-TAPE symbol remains OK for set-contract).

---

## 6. New finalizer architecture

```text
official TAPE registration primitive (existing set-contract; future call only)
        +
HoodLock lock primitive (hoodlock.mjs encode + verify)
        ↓
tge-finalize-rehearsal.mjs (state machine, Phase 1 read-only)
        ↓
tge-finalize.mjs CLI
```

Phase 1 rehearsal module **does not import** DB upsert / wallet send / private keys. Mutation for DB remains solely in `set-tape-contract.mjs` (not invoked by finalizer).

---

## 7. Operator UX

```bash
pnpm tape:tge-finalize 0xACTUAL_TAPE_ADDRESS          # preview
pnpm tape:tge-finalize 0xACTUAL_TAPE_ADDRESS --confirm # refused
```

Optional env (names only): `ROBINHOOD_RPC_URL`, `DATABASE_URL` (read-only), `TAPE_TGE_DEV_BUY_WALLET` (must match on-chain deployer when both present).

---

## 8. TAPE identity validation

Hard checks: valid address, chainId `4663`, non-empty bytecode, **`symbol === "TAPE"`**. Soft/printed: name, decimals, totalSupply.

Unlike `tape:set-contract`, unexpected symbol is a hard failure.

---

## 9. DB-state behavior

Read-only `protocol_settings.tape_official_contract`:

| State | Finalizer behavior |
|---|---|
| `UNSET` | Preview plans future set; **WRITE: NO** |
| `SAME_AS_CANDIDATE` | Treat as already complete |
| `DIFFERENT_FROM_CANDIDATE` | **BLOCKED — EXISTING OFFICIAL TAPE ADDRESS DIFFERS** (no override) |

---

## 10. Canonical-address transition

After future DB success, canonical address = **DB read-back**, not the original CLI argument. Phase 1 emulates: `UNSET` → planned read-back = candidate; subsequent HoodLock/allocation stages consume `canonicalTape`.

---

## 11. Dev-buy wallet identity

| Role | Identity |
|---|---|
| Dev-buy holder | `launchAndBuy` `msg.sender` = `InitialBuyExecuted.deployer` |
| Creator fee recipient | Separate; **not** assumed |
| Fixed in-repo TAPE wallet | **None** |

Without live TAPE logs and without `TAPE_TGE_DEV_BUY_WALLET`, wallet shows as pending / rule-only — not a casually invented default address.

---

## 12. Dev-allocation detection method

**Selected method:** `InitialBuyExecuted.tokensOut` for the TAPE token on canonical Factory `0x4B227d…DD3C`.

Hierarchy implemented:

1. Deterministic `tokensOut` from event (preferred)
2. Optional configured wallet must match deployer
3. Whole-wallet balance is **not** default (helper only asserts equality when explicitly compared)

If TAPE not launched / no event:

```text
DEV ALLOCATION: NOT YET PROVABLE WITHOUT LIVE TAPE LAUNCH
```

Multiple events → **BLOCKED — AMBIGUOUS**.

---

## 13. TAPE token-model / HoodLock compatibility

```text
TAPE TOKEN MODEL: STANDARD_ERC20
HOODLOCK COMPATIBILITY: PASS
```

Evidence: ScoopToken fixed supply; protocol docs “Transfer tax: None”; ABI has no tax/rebase hooks; trading fees are Uniswap v4 LP / FeeDistributor (pool/protocol), not ERC-20 transfer taxes. Compatible with HoodLock standard-ERC-20 path.

---

## 14. HoodLock identity/code-hash verification

Live rehearsal verified:

| Check | Result |
|---|---|
| Address | `0xD0f7…C32F` |
| chainId | 4663 |
| SHA-256 | `00da4abbf334…d7cd4cf4` **VERIFIED** |
| Mismatch | `BLOCKED — HOODLOCK BYTECODE DOES NOT MATCH…` (no override) |

---

## 15. Live fee handling

Fee read live via `fee()` each rehearsal. Observed during Phase 1 runs: **0.005 ETH** (`5000000000000000` wei). Not hardcoded into lock intent construction (intent uses the read value).

---

## 16. 6-calendar-month policy

**Policy update (before mutation enablement):** `12 calendar months → 6 calendar months`.

**Approach:**

- Canonical constant `TGE_DEV_BUY_LOCK_CALENDAR_MONTHS = 6`.
- `addCalendarMonthsUtc(ts, 6)` with UTC fields + end-of-month clamp (leap-day / month-end covered by tests).
- **Proposal:** `unlock = addCalendarMonthsUtc(chainTimestamp, 6) + 300s` safety margin so a slightly later mined `block.timestamp` still satisfies ≥ 6 calendar months.
- **Post-receipt proof (future):** `recordedUnlock >= addCalendarMonthsUtc(lockBlockTimestamp, 6)` (no margin required on the proof side).

Not an unexplained fixed-day approximation (`180` / `182` / `183` days).

---

## 17. Approval design

Future path (encoded in Phase 1, never sent):

- Spender = canonical HoodLock only
- Amount = exact intended lock amount
- Unlimited (`2^256-1`) rejected
- Skip if allowance already ≥ amount
- Future mutation must wait for receipt + re-read allowance

---

## 18. Lock transaction construction

Direct ABI `lock(token, amount, unlockTime)`:

- `to` = pinned HoodLock
- `value` = live `fee()`
- `chainId` = 4663
Decode round-trip tested. HoodLock HTTP API is **not** used as source of truth.

---

## 19. Simulation behavior

Classifiers: `SIMULATABLE NOW` / `BLOCKED BY CURRENT ALLOWANCE` / `BLOCKED BY MISSING LIVE TAPE` / `OTHER`.

Phase 1 does not fake success. Without live TAPE allocation, CLI reports `BLOCKED BY MISSING LIVE TAPE`. Future confirmed path must `eth_call` after approval, immediately before broadcast.

---

## 20. Resumability / idempotency

Stages: `PRECHECK` → `OFFICIAL_TAPE_DB` → `DEV_ALLOCATION` → `HOODLOCK_APPROVAL` → `HOODLOCK_LOCK` → `FINAL_VERIFICATION` with statuses `NOT_STARTED | ALREADY_COMPLETE | READY | BLOCKED | FAILED`.

Examples covered in tests: DB same → continue; allowance already enough → skip approve; existing valid lock → lock stage complete; DB different → block.

---

## 21. Duplicate-lock protection

Uses HoodLock `locksByOwner` ∩ `locksByToken`, then `locks(id)` filters: same token, owner, amount (tolerance 0), not withdrawn, unlock ≥ policy minimum. 0 → proceed; 1 → already complete; >1 → `BLOCKED — AMBIGUOUS EXISTING TAPE LOCKS`. Chain is authoritative (no local state file).

---

## 22. Lock-owner semantics

`lock()` sets `owner = msg.sender`. Finalizer lock tx must be signed by the wallet holding the dev-buy TAPE. **No** `transferLockOwnership` in TGE finalization. If long-term owner must differ, that is an explicit post-TGE manual decision (reported, not invented).

---

## 23. Final verification design

Future success requires on-chain proof: lock exists; token == DB canonical TAPE; owner expected; amount == recorded received; withdrawn false; unlock ≥ 6 calendar months from lock-time reference; record lock id / amounts / unlock UTC / tx hash / URLs. HoodLock website proof is supplemental only.

---

## 24. `--confirm` hard-disable proof

```text
pnpm tape:tge-finalize 0x… --confirm
→ exit 1
→ "TAPE TGE FINALIZER — BROADCAST NOT ENABLED"
→ "Phase 1 is rehearsal-only."
→ "No database or blockchain mutation has been performed."
```

Confirmed before any DB connect / approve / lock. No hidden env unlock. Rehearsal module has no mutation imports.

---

## 25. Tests / commands / results

```bash
pnpm test:tge-finalize
# 44 passed (37 finalizer + 7 set-contract verify)
```

CLI checks:

| Command | Result |
|---|---|
| `pnpm tape:tge-finalize --help` | OK |
| `… --confirm` | Refused, exit 1 |
| `… not-an-address` | Preview fail, exit 1, WRITE NO |
| `… <Factory>` | Symbol not TAPE / unreadable → fail; HoodLock hash still verified live |

---

## 26. Existing `tape:set-contract` regression result

`--help` OK; shared verifier still soft-accepts non-TAPE symbols; no production `--confirm` mutation run.

---

## 27. Live TGE checks still pending official TAPE

```text
TOOLING TESTED
```

- Arg parsing / confirm refuse
- Identity hard rules (mocked + live fail paths)
- DB classify / canonical transition
- HoodLock live code-hash + fee read
- Unlock policy / encode / stages / duplicate detection
- ScoopToken model classification

```text
LIVE TAPE-SPECIFIC CHECKS PENDING TGE ADDRESS
```

- Real TAPE bytecode + symbol `TAPE`
- `InitialBuyExecuted` for that token
- Allowance/balance against HoodLock
- Existing-lock scan for that allocation
- End-to-end preview with SIMULATABLE NOW on mainnet state

---

## 28. Security observations / blockers

| Item | Notes |
|---|---|
| No third-party HoodLock audit | Trust caveat from forensic report; not a Phase 1 tooling blocker |
| Dev wallet not hardcoded | Correct; resolve from events / explicit env match |
| Fee uncapped for *new* locks | Re-read fee immediately before future broadcast |
| Shared HoodLock vault | ScoopToken is standard ERC-20 — OK |
| Phase 2 mutation | Must remain gated; Alex → independent ChatGPT review before enabling |

No Phase 1 blocker that prevents security review of this tooling.

---

## 29. Git status / scope confirmation

Scoped changes limited to operational scripts, tests, `package.json`, and this audit. Unrelated dirty/untracked files untouched. **No stage / commit / push.**

Confirmed absent this phase: transactions, signatures, approvals, locks, private keys, production DB writes, product/indexer edits, deploy.

---

## 30. Final gate

```text
PHASE 1 PASSED — SAFE TO REVIEW BEFORE ENABLING TGE MUTATIONS
```

Next step is **not** enabling broadcast. Upload this report for independent review first.
