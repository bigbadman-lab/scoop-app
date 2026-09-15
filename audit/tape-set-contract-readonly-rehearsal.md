# SCOOP — TGE Readiness: READ-ONLY `tape:set-contract` Rehearsal

## 1. Verdict

```text
PASS — TAPE SET-CONTRACT COMMAND READY FOR TGE
```

The operator CLI is a **single-purpose runtime DB write** to `protocol_settings.tape_official_contract`, gated by `--confirm`, preceded by hard on-chain checks (valid address, RPC chain `4663`, non-empty bytecode). It does **not** redeploy Vercel, edit git/env files, or broadcast transactions. Soft ERC-20 metadata (symbol/name/decimals) is printed but **not** enforced — operators must manually confirm symbol `TAPE` before running.

---

## 2. Repository state

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD | `964b3af5ae5d6ba766a3a14f0cfa03b91ec5c7ac` (matches expected token-avatar push) |
| Status | Pre-existing dirty/untracked audits + `P10.4-*` preserved |
| Source edits this task | **None** |

---

## 3. Command implementation

```text
pnpm tape:set-contract
→ package.json script: "node scripts/set-tape-contract.mjs"
→ scripts/set-tape-contract.mjs  main()
   → parseTapeSetContractArgs (scripts/lib/tape-contract-verify.mjs)
   → normalizeTapeAddress (viem isAddress + getAddress)
   → [gate] require --confirm else exit 1 (preview message only)
   → load DATABASE_URL + ROBINHOOD_RPC_URL (process.env or .env.local)
   → verifyTapeContractOnChain (viem publicClient: getChainId, getBytecode, soft ERC-20 reads)
   → pg.Client connect
   → ensure protocol_settings exists
   → getExisting; idempotent / --override gates
   → upsert key tape_official_contract = address.toLowerCase()
   → read-back verify
```

| Piece | Path |
| --- | --- |
| Root script | `package.json` → `tape:set-contract` |
| CLI | `scripts/set-tape-contract.mjs` |
| Verify helpers | `scripts/lib/tape-contract-verify.mjs` |
| Unit tests | `scripts/tape-contract-verify.test.ts` |
| DB key / readers | `packages/db/.../protocol-settings.ts` (`TAPE_OFFICIAL_CONTRACT_KEY`) |
| Consumers | `apps/web/.../load-stats.ts` → `/protocol/tape` + `GET /api/protocol/stats` |
| Table migration | `supabase/migrations/20260914140000_protocol_settings.sql` |

Env reads: `DATABASE_URL`, `ROBINHOOD_RPC_URL` (never printed).
External: Postgres (mutate only with `--confirm` after hard checks); Robinhood RPC (read-only eth_chainId / eth_getCode / eth_call).

---

## 4. CLI contract

| # | Question | Answer |
| --- | --- | --- |
| 1 | Address required? | **Yes** — exactly one positional |
| 2 | `--confirm` required to mutate? | **Yes** |
| 3 | Explicit dry-run mode? | **No named dry-run**; omitting `--confirm` is refuse-to-mutate preview |
| 4 | Without `--confirm`? | Exit 1; prints chain + address + suggested re-run (no DB/RPC if address invalid first) |
| 5 | No address? | Exit 1: `Usage: pnpm tape:set-contract <0xAddress> --confirm [--override]` |
| 6 | Malformed address? | Exit 1: `Invalid EVM address.` (before confirm gate) |
| 7 | Checksum? | Accepts any viem-valid address; normalizes via `getAddress`; **stores lowercase** |
| 8 | Reject zero address? | **No** at normalize (zero is valid EVM address); with `--confirm` hard-fails if no bytecode |
| 9 | Bytecode exists? | **Yes** — hard fail if empty/`0x` |
| 10 | Chain 4663? | **Yes** — hard fail if RPC chain ≠ `ROBINHOOD_CHAIN_ID` (4663) |
| 11 | Metadata name/symbol/decimals? | **Soft only** — printed; unreadable → `(unreadable)`; **non-fatal** |
| 12 | Verify “is TAPE”? | **No** — does not require `symbol === 'TAPE'` |
| 13 | Owner/deployer? | **NOT CHECKED** |
| 14 | Query RPC before write? | **Yes** — verification runs before DB connect upsert |
| 15 | Env/credentials? | `DATABASE_URL` + `ROBINHOOD_RPC_URL` required for confirm path |
| 16 | Mutation gate? | `parsed.confirm === true` **and** address normalize ok **and** on-chain verify ok **and** table present **and** (no conflicting existing **or** `--override`) |

Also: `--help` / `-h` prints usage and exits 0. Unknown flags → error.

---

## 5. `--confirm` mutation map

Reachable mutation from `pnpm tape:set-contract <VALID> --confirm`:

| Mutation | Exact target | Old value source | New value | Local/remote | Reversible? |
| --- | --- | --- | --- | --- | --- |
| Upsert setting | Postgres `protocol_settings` row `key='tape_official_contract'` | `SELECT value …` | lowercase `0x…` address | **Remote DB** (via `DATABASE_URL`) | Yes via later `--confirm --override` with another address, or manual SQL |

| Category | Status |
| --- | --- |
| Source files / generated config / docs / Git | **NOT TOUCHED** |
| `.env` / Vercel / Render env | **NOT TOUCHED** |
| Supabase Storage | **NOT TOUCHED** |
| Migrations | **NOT TOUCHED** (requires table already present) |
| Token catalogue / pairs / indexer / workers / fee keeper / holder rewards | **NOT TOUCHED** |
| Frontend build-time env | **NOT TOUCHED** (runtime DB read) |
| Blockchain state / txs | **NOT TOUCHED** (RPC read-only) |
| Deployment triggers | **NOT TOUCHED** |

Help text: “runtime DB; no Vercel redeploy.”

---

## 6. Safe rehearsal results

**No `--confirm` invocations were run.**

| Command | Exit | Outcome | Files changed? | External mutation? |
| --- | --- | --- | --- | --- |
| `pnpm tape:set-contract --help` | **0** | Prints usage | No | No |
| `pnpm tape:set-contract` | **1** | Usage error | No | No |
| `pnpm tape:set-contract 0xACTUAL_TAPE_CONTRACT_ADDRESS` | **1** | `Invalid EVM address.` | No | No |
| `pnpm tape:set-contract 0x1111…1111` | **1** | Refuse without `--confirm`; prints checksummed address + re-run hint | No | No |
| `pnpm tape:set-contract 0x0000…0000` | **1** | Same refuse-without-confirm (zero accepted as address shape) | No | No |

Pre/post `git status` line count unchanged at **67** for this rehearsal; no tape-script diffs introduced.

Local normalize probe: `0xACTUAL_TAPE_CONTRACT_ADDRESS` → `null`; zero/dummy → valid addresses.

---

## 7. Placeholder validation

```text
0xACTUAL_TAPE_CONTRACT_ADDRESS
```

is **not** a valid EVM address (`normalizeTapeAddress` → `null`). CLI exits with `Invalid EVM address.` **before** `--confirm` mutation, env load, RPC, or DB. Even if mistakenly paired with `--confirm`, it cannot mutate (fails at normalize). **Not tested with `--confirm` in this rehearsal.**

---

## 8. On-chain validation

| Check | Severity |
| --- | --- |
| Valid EVM address | **ENFORCED BY SCRIPT** |
| RPC `getChainId() === 4663` | **ENFORCED BY SCRIPT** |
| Non-empty contract bytecode | **ENFORCED BY SCRIPT** |
| ERC-20 `symbol` / `name` / `decimals` readable | Soft print only |
| `symbol === 'TAPE'` / expected name | **NOT ENFORCED** — **MUST BE VERIFIED MANUALLY** |
| Deployer/owner | **NOT ENFORCED** |
| Official address matches deployment receipt / explorer | **MUST BE VERIFIED MANUALLY** |

---

## 9. Preconditions for real TGE execution

| Item | Requirement |
| --- | --- |
| Working directory | Repo root (`pnpm tape:set-contract`) |
| Env | `DATABASE_URL` (production Postgres), `ROBINHOOD_RPC_URL` (chain 4663) in shell or `.env.local` |
| Table | `protocol_settings` present (migration applied) |
| Address | Official 40-hex TAPE contract on Robinhood Chain with bytecode |
| Network | Outbound RPC + DB connectivity |
| Credentials | Operator DB URL with write access to `protocol_settings` |
| Address form | Any valid checksum/lowercase accepted; **stored lowercase** |

---

## 10. Exact real command

```bash
pnpm tape:set-contract 0x<OFFICIAL_TAPE_ADDRESS> --confirm
```

If a **different** address is already configured:

```bash
pnpm tape:set-contract 0x<OFFICIAL_TAPE_ADDRESS> --confirm --override
```

Canonical safest form: unquoted `0x` + 40 hex (checksum or lowercase). Do not invent the address.

---

## 11. Post-command propagation

| Automatic | Not required |
| --- | --- |
| Web SSR `/protocol/tape` (`force-dynamic`) reads DB | Commit/push/deploy for this setting |
| `GET /api/protocol/stats` includes `tape.contractAddress` | Indexer/worker restart |
| Client poll ~20s (`ProtocolStatsLive`) | Vercel env change |

Expected visibility: **~0–20 seconds** after successful write (CDN `s-maxage=20` soft). Soft refresh of open tab sufficient.

**Running the command alone is sufficient** for production UI/API to pick up the address — **no redeploy**.

---

## 12. Post-command verification matrix

| Surface | Expected post-command state | Verification |
| --- | --- | --- |
| Postgres `protocol_settings` | `key=tape_official_contract`, `value` = lowercase official address | SQL: `SELECT value, updated_at FROM protocol_settings WHERE key='tape_official_contract';` |
| CLI stdout | `TAPE official contract updated` + address + source key (or “already set / No change required”) | Capture run output |
| `GET /api/protocol/stats` | `tape.contractAddress` = checksummed official address | `curl` / browser against production API |
| `/protocol/tape` UI | Contract card shows address (not TBA) | Open page; wait ≤20s / soft refresh |
| On-chain (manual) | Same address has bytecode; symbol TAPE | Explorer / `cast` / RPC (manual) |

Surfaces **not** updated by this command (no need to verify for this write): indexer config, fee keeper, holder rewards, quote catalogue, git, Vercel env.

---

## 13. Failure / idempotency / recovery

| Scenario | Behaviour |
| --- | --- |
| Address validation fails | Exit 1 before RPC/DB |
| No `--confirm` | Exit 1; no mutation |
| RPC unavailable / wrong chain / no bytecode | Exit 1 before DB write |
| Soft ERC-20 unread | Continues (printed unreadable) |
| Missing `protocol_settings` | Exit 1; instructs `pnpm db:migrate` |
| Existing different address without `--override` | Exit 1; no write |
| Same address again | Exit 0; “No change required.” — **idempotent** |
| Upsert then read-back mismatch | Exit 1 after attempted write |
| Interrupted mid-flight | Single-row upsert; worst case incomplete transaction handled by Postgres client disconnect — no multi-target split brain |
| Later different address | Requires `--override` |

**Is the command idempotent?** Yes for the same address.
**Partial inconsistent multi-surface state?** Unlikely — **one DB key only**. Recovery: re-run with correct address (`--override` if needed) after fixing env/RPC; do not “un-set” via this CLI (no delete path in script).

---

## 14. TGE runbook snippet

```text
TAPE CONTRACT CONFIGURATION — TGE RUNBOOK

PRECHECK
1. Confirm official TAPE deployment address from deployment receipt + Robinhood explorer (chain 4663).
2. Manually verify bytecode present and ERC-20 symbol == TAPE (and expected name/decimals). Script will NOT hard-fail on wrong symbol.
3. Confirm production DATABASE_URL and ROBINHOOD_RPC_URL available in the operator shell (or .env.local).
4. Confirm protocol_settings table exists; optionally SELECT current tape_official_contract (expect null or intentional prior value).
5. Confirm git/production app already includes runtime tape readers (no redeploy required for this write).

EXECUTE
pnpm tape:set-contract 0x<OFFICIAL_TAPE_ADDRESS> --confirm
# If a different address is already set and replacement is intentional:
# pnpm tape:set-contract 0x<OFFICIAL_TAPE_ADDRESS> --confirm --override

VERIFY
1. CLI reports updated (or already set) with the official address.
2. SELECT value FROM protocol_settings WHERE key = 'tape_official_contract';
3. GET /api/protocol/stats → tape.contractAddress matches.
4. /protocol/tape contract card shows the address within ~20s.

NEXT ACTION
Proceed with remaining TGE checklist items (this command does not launch tokens or change indexer/keepers).
```

---

## 15. Scope confirmation

Confirmed **NO**:

- source/config edits
- production mutation (`--confirm` never run)
- database mutation
- environment mutation
- blockchain transaction
- image generation / token launch
- stage / commit / push / deploy

Only new file: this report.

---

## 16. Final gate

```text
TAPE CONTRACT COMMAND REHEARSED — SAFE TO INCLUDE IN TGE RUNBOOK
```
