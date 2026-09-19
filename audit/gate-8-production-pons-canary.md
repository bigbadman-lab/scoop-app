# Gate 8 — Production Enablement + Controlled Pons V2 Canary

## 1. Verdict

`BLOCKED — PRODUCTION CANARY INCOMPLETE`

**Irreversible production progress that did succeed:**

- Gate 6 DB migration **applied** to production Postgres (`market_source` + `curve_address` + nullable UV4 fields)
- Isolated production commit created: `25b0b0e77553e3357ab70c58b572fda4e1cfefd7`
- Unrelated dirty tree **not** included in that commit

**Hard stops before canary broadcast:**

1. **Vercel deploy blocked** — CLI login valid but team access `forbidden` (cannot deploy `scoop.fun` from this environment)
2. **Canary ETH amount not authorized** — Gate 8 requires explicit operator amount before any LaunchAndBuy broadcast
3. Production web/indexer still on pre-Pons commit until deploy

No Pons launch, approval, or HoodLock lock was broadcast.

## 2. UTC timeline

| Event | UTC |
|---|---|
| Phase A preflight | `2026-09-19T18:17:21Z` |
| Phase B tests + web build PASS | `2026-09-19T18:23:28Z` |
| Phase C schema inspect (pre-migration) | `2026-09-19T18:24:xxZ` |
| Production commit | `2026-09-19T18:25:xxZ` |
| Phase D migration applied | `2026-09-19T18:25:26Z` |
| Vercel whoami / deploy attempt | `2026-09-19T18:26:31Z` |
| Production schema-ready probe (live site) | post-migration, pre-deploy |
| Launch / approval / lock txs | **N/A — not broadcast** |

## 3. Git / deploy state

| Field | Value |
|---|---|
| Branch | `main` |
| Pre-HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Production commit | `25b0b0e77553e3357ab70c58b572fda4e1cfefd7` |
| Message | `feat: migrate public launches to Pons V2 with HoodLock` |
| Files in commit | **103** (see `audit/gate-8-pons-production-changeset.txt`) |
| Push status | **NO** (Gate 8: do not push until review; also deploy tooling blocked) |
| Web deploy ID | **NONE** |
| Indexer deploy/restart | **NONE** |
| Dirty leftovers | Unrelated audits / P10.4 reports preserved uncommitted |

### Phase A isolation

`PASS` — intended Gates 3–7 files enumerated and committed alone. Unrelated dirty work left unstaged.

## 4. DB migration

| Item | Value |
|---|---|
| File | `supabase/migrations/20260919180000_gate6_pons_market_source.sql` |
| Result | **`PASS — PRODUCTION DB MIGRATION`** |
| Method | Single-file apply via `pg` client (not full `db:migrate` sweep) |
| Pre launches | **13** |
| Post launches | **13** |
| `market_source` | present, `NOT NULL`, default `'scoop'` |
| Allowed values | `scoop`, `pons_v2` (check constraint) |
| `curve_address` | present, nullable |
| UV4 columns | now nullable (`pool_id`, fee distributor, locker, etc.) |
| Legacy backfill | **all 13 rows `market_source = scoop`** |

### Phase C pre-migration (read-only)

- `market_source` **absent**
- UV4 columns `null=NO`
- No schema drift vs Gate 6 assumptions → proceed

## 5. Production schema gate

Live probe `GET https://scoop.fun/api/launch/pons-schema-ready`:

- Endpoint **not served by current production deploy** (pre-Pons code) — expect 404/HTML or non-ready until code ships
- DB capability **is** ready after migration; app gate will pass only after deploy of `25b0b0e`

## 6. Live preflight

**Not completed** — requires deployed public path + operator canary wallet session.

Canonical addresses (from Gate 2 lock / commit):

| Item | Address |
|---|---|
| Chain | `4663` |
| Factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` |
| LaunchAndBuy | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` |
| HoodLock | `0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F` |

Live `canLaunch` / `launchFee()` / HoodLock `fee()` **not read in this gate run** (no canary wallet authorization).

## 7. Canary metadata

**BLOCKED — CANARY DEV BUY AMOUNT NOT AUTHORIZED**

No canary name/ticker/amount selected. No wallet broadcast path executed.

## 8–10. Pons / HoodLock proofs

| Proof | Status |
|---|---|
| Pons tx hash | **NONE** |
| Token / curve / `devTokensOut` | **NONE** |
| Approval tx | **NONE** |
| Lock tx / lock id / unlock | **NONE** |

## 11. Indexer proof

**NONE** — no canary launch; indexer not redeployed to Pons commit.

## 12. Token page proof

**NONE**

## 13. Legacy regression proof

Not re-validated post-deploy (no deploy). Migration preserved 13/13 Scoop rows. Pre-deploy homepage/markets HTTP smoke still 200-class where checked; full post-deploy regression **deferred**.

## 14. Canary visibility treatment

**N/A** — no canary token. When canary exists, prefer existing `HIDDEN_PRODUCTION_CANARY_TOKENS` mechanism (`audit/launch-day-hide-production-canaries.md`).

## 15. Tests (Phase B)

| Suite | Result |
|---|---:|
| `@scoop/contracts` tests | 24 passed |
| `@scoop/contracts` typecheck | PASS |
| `@scoop/shared` unlock + marketSource | 12 passed |
| `@scoop/shared` typecheck | PASS |
| `@scoop/db` tests | 114 passed |
| `@scoop/db` typecheck | PASS |
| Indexer `decodePons` | 6 passed |
| Indexer typecheck | PASS |
| Web Pons/HoodLock/cutover/trade-guard/shell | **134** passed |
| Web typecheck | PASS |
| `pnpm --filter @scoop/web build` | **PASS** (after removing `@ts-nocheck` from fixtures) |

`PASS — PRODUCTION TEST GATE`

## 16. Open issues

1. **Vercel team access forbidden** for CLI deploy from this environment — operator must deploy `25b0b0e` (push + Production deploy / authorized Vercel account).
2. **Indexer / Render restart** still required so production indexer understands Pons Factory / curve events.
3. **Canary ETH amount** must be explicitly authorized before LaunchAndBuy.
4. Live `canLaunch(canaryWallet)` + fee reads still pending.
5. Push of `25b0b0e` intentionally not performed in-agent pending review / deploy ownership.

## 17. Recommendation

Resume Gate 8 as a **short operator continuation**, not Gate 9:

1. Review commit `25b0b0e` diff (changeset list already isolated)
2. Push `main` / deploy web to `scoop.fun`
3. Redeploy/restart indexer on same SHA
4. Confirm `GET /api/launch/pons-schema-ready` → `{ "ready": true }`
5. Authorize canary wallet + **exact ETH dev-buy amount**
6. Execute Phases H–Q (one LaunchAndBuy → HoodLock → index → token page)
7. Hide canary via existing discovery exclusion if desired

Only after canary **PASS** should Gate 9 (`$TAPE` de-surface + orange → `#015225`) start.

## 18. Production mutation summary

```text
DB migration applied: YES
production commit created: YES (25b0b0e)
production push: NO
production deploy: NO
Pons launch broadcast: NO
approval broadcast: NO
HoodLock lock broadcast: NO
token indexed: NO
lock verified: NO
```
