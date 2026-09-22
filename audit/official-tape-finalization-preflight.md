# Official $TAPE — 6-month finalization preflight

## Verdict

```text
BLOCKED — OFFICIAL TAPE FINALIZATION NOT READY
```

**Stop rules hit (Gate 0E):**

1. `SOLANA_KEYPAIR_PATH` **MISSING** → `BLOCKED — SAFE LOCAL DEPLOYER SIGNER NOT AVAILABLE`
2. No `--mint <REAL_TAPE_MINT>` supplied → mint must not be fabricated

```text
NO STREAMFLOW TRANSACTION BROADCAST DURING PREFLIGHT
```

UTC: `2026-09-22T15:21:30Z`

---

## 1. Exact required local env variable names

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Production DB |
| `SOLANA_RPC_URL` | Alchemy Solana mainnet RPC |
| `NEXT_PUBLIC_SUPABASE_URL` | Token-image mirror |
| `SUPABASE_SERVICE_ROLE_KEY` | Token-image mirror write |
| `SOLANA_KEYPAIR_PATH` | Absolute local deployer keypair path |

Streamflow API key: **not required** (`@streamflow/stream@13.4.0` uses RPC + signer).

Checklist: `audit/official-tape-local-env-checklist.md`

---

## 2. PRESENT / MISSING (this workstation)

```text
DATABASE_URL:                 PRESENT
SOLANA_RPC_URL:               PRESENT
NEXT_PUBLIC_SUPABASE_URL:     PRESENT
SUPABASE_SERVICE_ROLE_KEY:    PRESENT
SOLANA_KEYPAIR_PATH:          MISSING
Streamflow API key required:  NO
RPC network:                  MAINNET
```

---

## 3. Signer public key

```text
MISSING
```

Expected match:

```text
44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27
```

---

## 4–8. Pump mint / import / image / token page / Alchemy

**Not run** — no real mint provided.

Mobile token-page crash gate: **PASS** (`audit/mobile-token-page-client-crash.md`) — unblocks Gate 3 mobile once mint is imported.

External import path: **READY** (`preflightExternalPumpMint` → `importExternalPumpMarket` with `importKind: 'official'`).

---

## 9–10. Installed Streamflow SDK / lock method

| Item | Value |
|------|-------|
| Package | `@streamflow/stream@13.4.0` (added to `@scoop/web`) |
| Lock API | `buildLockParams` / `createLock` with `ICreateLockParams` |
| Params | `{ recipient, tokenId, amount, unlockDate, name, transferableByRecipient: false }` |
| Type | True time lock (not gradual vesting); cancelable flags forced `false` |

---

## 11–15. Dev balance / unlock / dust / SOL

**Not measured** — requires real mint + RPC token accounts for deployer.

Dust semantics (SDK): cliff unlocks `amount - 1` raw units; **1 raw unit** residue releases 1s later. Product language: **full economically meaningful dev allocation**.

Min SOL gate: `120_000_000` lamports (0.09 creation fee + 0.03 buffer).

Unlock math: `addCalendarMonthsUtc(createdUnix, 6)` with end-of-month clamp (unit-tested).

---

## 16. Confirmation phrase

```text
LOCK TAPE FOR 6 MONTHS
```

CLI refuses broadcast without exact match (`assertLockConfirmPhrase`).

---

## 17. Explicit statement

```text
NO STREAMFLOW TRANSACTION BROADCAST DURING PREFLIGHT
```

No DB official registration. No homepage announcement activation. No canary mint used.

---

## Tooling prepared (ready once mint + keypair exist)

| Piece | Status |
|-------|--------|
| `pnpm official:finalize` | Added |
| Env audit (redacted) | Added |
| Mint gates (symbol TAPE + creator) | Added |
| Streamflow lock param builder + dust | Added |
| Solana official config (`tape_official_solana` JSON) | Added (write only after `lockVerified`) |
| Calendar-month unlock math | Added + tested |
| Homepage / token official UI activation | **Deferred** until lock verified (Gate 10–11) |

---

## Operator next steps

1. Place deployer keypair on disk (never paste into `.env`):

```bash
export SOLANA_KEYPAIR_PATH=/absolute/path/to/keypair.json
```

Derived pubkey must equal `44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27`.

2. Launch `$TAPE` on Pump.fun from that wallet; supply the real mint:

```bash
pnpm official:finalize --mint <REAL_TAPE_MINT> --preflight-only
```

3. Only after preflight **PASS**, re-run with exact phrase:

```bash
pnpm official:finalize --mint <REAL_TAPE_MINT> --confirm "LOCK TAPE FOR 6 MONTHS"
```

Do not proceed to Streamflow broadcast until this preflight report flips to:

```text
PASS — OFFICIAL TAPE 6-MONTH FINALIZATION READY
```
