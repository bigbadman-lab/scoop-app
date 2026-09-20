# Gate G — Production Readiness + First Public Pump.fun Launch

## Verdict

`BLOCKED — SOURCE NOT READY (Gates B–F uncommitted on main)`

---

## Source/deployment

### G.1 — Git / deployment readiness

**Result: FAIL — not `PASS — SOURCE READY`**

| Check | Result |
|-------|--------|
| Branch | `main` (tracks `origin/main`, up to date at `2de0f72`) |
| Working tree | **Dirty** — large uncommitted Gate B–F surface |
| Intended Solana/Pump changes committed | **No** |
| Production deploy source | `origin/main` @ `2de0f72` (`docs: record gate 8e deploy and smoke`) — **does not include** Solana/Pump Gates B–F |
| Dev probe pages linked publicly | Not linked from nav/footer (routes exist as untracked `/dev/*` + flag helpers); still uncommitted |
| Secrets committed | No `.env` / credential files in the intended Solana set (`.env.example` only documents placeholders) |

**Uncommitted / untracked (non-exhaustive):** Pump adapter + public launch APIs, Solana libs, Gate E migration + `pump-markets` repo, Gate F branding/SEO/docs, brand assets (`solana.svg`, `pump.svg`, `og-home2.jpg`), audit reports A–F + migration repair.

Gate G forbids production deploy / first Pump launch until source is committed and deployable. **Stopped at G.1.**

No commit was created in this gate (repo rule: commit only when explicitly requested). To unblock G.1, commit the Solana Gate B–F + migration repair set on the production branch, then re-run Gate G.

---

## Production migration

### G.2 — Repair verification (read-only)

| Check | Result |
|-------|--------|
| `audit/gate-e-migration-dependency-repair.md` | `PASS — GATE E MIGRATION DEPENDENCY REPAIR READY TO APPLY` |
| Migration file | `supabase/migrations/20260920230000_gate_e_solana_pump_markets.sql` |
| No CASCADE | Yes |
| Explicit view drop/recreate | `public_token_detail` → `public_token_discovery` → `launch_discovery` |
| Grants restored | `GRANT ALL` to `anon`, `authenticated`, `service_role` |
| No destructive row rewrite | Widen-only `::TEXT` |
| Solana seed `900001` / `chain_family` | Present |
| `market_source` includes `pump` | Present |

**G.2 itself would PASS**, but G.3 was **not** run because G.1 failed and Gate G requires migration apply only on the production path after source readiness.

### G.3 — Apply

**Not executed.** Prerequisite: repaired migration reviewed and applied only after source is ready; Gate G also says do not begin Pump launch until migration is applied.

---

## Environment

### G.4 — Not fully audited against Vercel production

Local `.env.example` documents the expected keys. Production Vercel values were **not** re-verified this run (stopped at G.1).

From repo contract (names only):

```text
SOLANA_RPC_URL: documented in .env.example (production SET/MISSING not confirmed this gate)
REOWN: documented (NEXT_PUBLIC_REOWN_PROJECT_ID)
SUPABASE: documented
ROBINHOOD RPC: documented (ROBINHOOD_RPC_URL)
```

---

## First Pump launch

**Not performed** — blocked before G.5–G.7.

---

## Solana confirmation

N/A

---

## Persistence

N/A

---

## Token page

N/A

---

## Pump.fun verification

N/A

---

## Robinhood/Pons regression

N/A — no production deploy of Solana rail yet.

---

## Markets board status

Gate F honesty stands in **uncommitted** copy only. Production still serves pre–Gate F site. Follow-up remains: **Multi-chain Markets Board**.

---

## Final evidence

| Check | Result | Evidence |
|---|---|---|
| Gate E migration repair audit | PASS (ready to apply) | `audit/gate-e-migration-dependency-repair.md` |
| Gate E migration applied | NOT RUN | Stopped at G.1 |
| Production deploy (B–F) | NOT RUN | Working tree dirty; `origin/main` lacks Solana |
| Solana wallet | NOT RUN | |
| Pump broadcast | NOT RUN | |
| Solana confirmation | NOT RUN | |
| Supabase persistence | NOT RUN | |
| `/token/<mint>` | NOT RUN | |
| Pump.fun external page | NOT RUN | |
| Robinhood rail | NOT RUN | |

```text
Mint: —
Pump signature: —
Creator: —
Solana confirmation slot: —
SCOOP token URL: —
Pump.fun URL: —
```

---

## Remaining follow-ups

1. **Commit Gates B–F + migration** (explicit ask), push production branch
2. Apply `20260920230000_gate_e_solana_pump_markets.sql` to production Supabase
3. Confirm Vercel env: `SOLANA_RPC_URL`, Reown, Supabase, Robinhood RPC
4. Deploy production
5. Re-run Gate G from G.3 through first public Pump launch
6. Multi-chain Markets Board (post-launch; not a G blocker once live)

Do not begin a real Pump launch until G.1–G.5 clear.
