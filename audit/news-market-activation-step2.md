# Step 2 Audit: Why Is `news_article_markets` Not Being Populated?

**Observed at (UTC):** 2026-09-14T21:24Z–21:30Z  
**Scope:** Read-only code + production DB inspection. No writes, no migrations, no MUSE mutations, no activation POST.

---

## 1. Verdict

## `F — MULTIPLE FAILURE MODES`

The join table/API/writer are intact and would succeed for MUSE **today** if invoked with the original inputs. Production has **0 rows** because the **only write path is a best-effort, browser-owned POST** after indexed launch, with **no durable server intent**, **no indexer write**, and **no backfill**. Several client lifecycle paths permanently skip or abort that write even when `launch_drafts` + indexed `launches` already exist.

At least **three** news-origin production markets (MUSE, 2HAWK, T110) have drafts + tokens and still no `news_article_markets` row — systemic, not MUSE-only.

---

## 2–4. Repo state

| Item | Value |
|------|-------|
| Branch | `main` |
| HEAD | `cdc1ffe02202edd58a2210171f34d2332868ca8b` |
| Git status | Unrelated dirty/untracked audit + P10.4 files; no activation-code edits from this audit |

---

## 5. Every writer to `news_article_markets`

| Op | Production code path |
|----|----------------------|
| INSERT | **Only** `linkNewsArticleMarket()` in `packages/db/src/repos/news-article-markets.ts` |
| UPDATE | None |
| DELETE | None |

**Call chain (sole production writer):**

```text
LaunchFlowLive.startCompletionFromTx / retryNewsLink
  → activateNewsArticleMarket()          // client fetch
    → POST /api/news/article-markets
      → linkNewsArticleMarket(serverDb())
        → INSERT … ON CONFLICT DO NOTHING
```

Indexer does not write this table (migration comment + no indexer references beyond reset preserve-list).

**Proof:** repo-wide search finds a single `INSERT INTO news_article_markets` outside tests.

---

## 6. Full activation API contract — `POST /api/news/article-markets`

**File:** `apps/web/src/app/api/news/article-markets/route.ts`

| Aspect | Behavior |
|--------|----------|
| Auth / session | **None** |
| Rate limit | None in route |
| Body | `tokenAddress` required; `chainId` optional (default SCOOP_CHAIN_ID); `providerArticleId` and/or `draftId` |
| Provider default | `STOCKNEWS_PROVIDER` (`stocknewsapi`) |
| Draft resolve | If article id missing and `draftId` set → `resolveArticleFromDraft` (`source_type='news'` + provider + provider_article_id) |
| DB client | `serverDb()` → `DATABASE_URL` pool (service/direct; bypasses RLS) |
| Success | **200** `{ ok: true, providerArticleId, tokenAddress }` |
| Errors | 400 invalid JSON / missing token / missing article / `invalid_input` / `article_not_found`; **409** `launch_not_indexed`; **503** `unavailable` |
| Waits for index? | **No** — caller must wait; endpoint hard-fails with 409 if launch missing |
| Pre-index token | **Cannot** insert |
| Browser session required? | **No** |

**Successful insert conditions (all required):**

1. Valid `tokenAddress`
2. Resolvable `providerArticleId` (body or draft)
3. Row in `launches` for `(chainId, tokenAddress)`
4. Row in `provider_news_articles` for `(provider, providerArticleId)`
5. DB insert succeeds (service role)

---

## 7. `linkNewsArticleMarket()` behavior

**File:** `packages/db/src/repos/news-article-markets.ts`

| Check | Failure reason |
|-------|----------------|
| Empty provider / article id / token | `invalid_input` |
| No `launches` row | `launch_not_indexed` |
| No `provider_news_articles` row | `article_not_found` |
| Else | `INSERT … ON CONFLICT (chain_id, token_address) DO NOTHING` → returns `{ linked: true }` even on conflict no-op |

- Does **not** query `tokens` (launch only).
- Soft failure via `{ linked: false, reason }` — does not throw on validation miss.
- Throws only on DB errors → route 503.
- Idempotent for same token.
- **Cannot** insert before canonical `launches` row exists.

---

## 8. Exact activation caller

| Caller | When |
|--------|------|
| `runLaunchCompletion()` via `LaunchFlowLive.startCompletionFromTx()` | Auto after `receipt_success` (and on pending-completion resume) |
| `LaunchFlowLive.retryNewsLink()` | Manual “Retry news” on Review step |

**Auto path details:**

- Starts only when `tx.phase === 'receipt_success'` with decoded token + txHash.
- Requires `hasNewsProvenance` (`sourceProviderArticleId` or `sourceDraftId`).
- Runs **after** `waitForIndexedLaunch` succeeds (poll 2.5s, timeout **90s**).
- Up to **2** activation attempts, **no delay** between them.
- Bound to `AbortSignal` from `completionAbortRef`.
- **Unmount aborts** completion (`useEffect` cleanup → `abort()`).
- `viewMarket()` → `router.replace(token page)` → unmount → **abort**.
- `canShowViewMarket` is true during `waiting_for_indexer`, `indexed`, `activating_news` — UI invites early leave.
- On `market_live` (including `news: 'failed'`) → **`clearPendingLaunchCompletion()`** — no auto-resume.
- Contrast: display-image bind uses `honorAbort: false` / server-owned path; **news does not**.

No durable server “activation intent” table/job exists.

---

## 9. Client provenance lifecycle

| Stage | `provider` / `providerArticleId` / `draftId` |
|-------|-----------------------------------------------|
| News card → `/news/{id}/launch` | Article id in URL |
| Artwork start | Draft created in DB with news provenance |
| Handoff → `/launch?assist=1` | sessionStorage (consumed once) → form `sourceProvider*` / `sourceDraftId` |
| Build params / orchestrate | Provenance snapshot on `tx` — **not in calldata** |
| Receipt / pending-completion | Saved to sessionStorage (30 min) with provenance |
| Activation POST | Uses `tx.provenance` only; server draft used only if client sends `draftId` |

**Disappear risks:** non-assist `/launch`; handoff already consumed + refresh; leave tab after `market_live` with news failed; provenance never rehydrated from server by token alone.

---

## 10. Timing diagram

```text
T0  submit tx
T1  receipt + decode token
T2  save pending-completion (session) + startCompletionFromTx
T3  waiting_for_indexer (poll /api/launches/by-token @ 2.5s, max 90s)
    ⚠ View Market enabled → navigate → abort (pending may remain)
T4  launches/tokens rows exist (indexer)
T5  wait returns ready  OR  timeout (activation NEVER runs)  OR  abort
T6  activating_news → POST /api/news/article-markets (≤2 tries, abortable)
T7  INSERT news_article_markets   OR fail → news_activation_failed
T8  market_live → clear pending (even if news failed)
T9  news API would surface market IFF row exists
```

| Edge | Nature |
|------|--------|
| T1→T3 | Guaranteed if LaunchFlowLive mounts completion |
| T3→T5 | Indexer + polling dependent; can timeout |
| T5→T6 | Skipped on timeout/abort/mismatch; provenance-gated |
| T6→T7 | Client/network dependent; abortable; only 2 tries |
| Leave during T3–T6 | Client dependent; often permanent unless return to `/launch` with pending |
| After T8 news failed | Permanent unless manual Retry before leave |

Canonical ~8–15s latency fits inside 90s **if the tab stays on the launch page**. Fragility is lifecycle, not the 8–15s window alone.

---

## 11–13. Preconditions, failure branches, retry/idempotency

**Preconditions for auto-link:** assist provenance on `tx` + indexed launch ready + browser still running completion + POST 200.

**Failure branches:** no provenance → skip; timeout → no POST; abort → no row; 409/400/503 ×2 → `news_activation_failed` + pending cleared; article missing → 400.

**Retry:** 2 immediate client attempts; manual Retry button while still on launch Review; no server retry/cron.

**Idempotency:** unique `(chain_id, token_address)` + `ON CONFLICT DO NOTHING`.

---

## 14–15. Browser / indexer dependency

- **Browser-lifecycle dependent:** yes (primary).
- **Indexer dependent:** yes (must wait; timeout skips activation entirely).
- **Not** salvageable by indexer alone today (indexer never writes the table).

---

## 16. Scenarios A–K

| ID | Scenario | Link outcome |
|----|----------|--------------|
| A | Receipt ok, not indexed yet | Wait ≤90s then POST; else **timeout → never created** (pending may allow resume) |
| B | Indexes in 12s, tab open | **Created** (happy path) |
| C | Indexes after navigate away | **Aborted**; pending may remain → resume only if user returns to `/launch` ≤30m |
| D | Tab close after receipt | **Lost** (session pending lost with tab/session) |
| E | Refresh success/launch page | **Retried** via pending-completion if within 30m |
| F | POST 4xx once | Second attempt; if both fail → **permanent** after `market_live` clears pending |
| G | POST 5xx/network once | Same as F |
| H | POST succeeds twice | Idempotent; one row |
| I | Article+token exist, client provenance missing | **Never created** (skipped) |
| J | Draft+article+token known, launch row missing | **409**; two tries then fail |
| K | Launch exists, client lost article/draft fields | **Never created**; no server lookup by token |

---

## 17. Production logging evidence

Markers exist in code: `activating_news`, `news_activation_failed`, `POST /api/news/article-markets` console.error on 503, UI `launch-news-sync-warning` / `launch-retry-news`.

**No production Vercel access logs retrieved** (API 403 in this session). No DB audit trail of failed POSTs. Cannot prove per-launch attempt timestamps from telemetry here.

---

## 18–19. MUSE-specific trace

| Fact | Value |
|------|-------|
| Token | `0x7c6b5347fa848121a8308dd12daca05171f5cbc5` |
| Indexed | Yes (`launches` + `tokens` + market state) |
| Draft | `56eb7d5d-81a2-4d02-a353-718bfe42b8ae` — `source_type=news`, provider+article id present |
| Article | `sna_url_5a92f59677e6b43b4ba42b2b` still in `provider_news_articles` |
| `news_article_markets` | **No row** |
| Activation code vs MUSE | Feature landed **2026-09-09**; MUSE **2026-09-14 ~13:33Z** — code predated launch |
| Feasibility **today** (read-only checks) | Launch check **pass**, article check **pass**, draft resolvable — **POST would insert if called** (not called in this audit) |
| Proven called at launch time? | **Not proven** (no logs). Failure consistent with abort / timeout / failed POST / leave-without-retry |

Most likely MUSE class: client completion never successfully finished activation (navigate/abort/timeout/failed POST), not API/DB rejection of valid inputs.

---

## 20. Systemic explanation (0 rows)

| Hypothesis | Evidence |
|------------|----------|
| Feature after all launches | **False** — 3 news-matched markets after 2026-09-09 still unlinked |
| Feature flag off | **False** — no flag gates activation |
| Caller unreachable / missing from build | Unlikely — code on `main` since Sept 9; Gate 3A lists route; unproven per deploy SHA |
| Auth blocks POST | **False** — no auth |
| RLS blocks insert | **False** — RLS on, **0 policies**; grants to `postgres`/`service_role`; `DATABASE_URL` bypasses RLS |
| Shared hard API bug | **False** — MUSE would pass checks today |
| Client-only best-effort never completes | **True** — matches 0/3 news-origin linked markets |

Also: display-image persistence was hardened (`honorAbort: false`) while news activation remained abortable client-side — same completion flow, asymmetric durability.

---

## 21. RLS / permissions

- RLS **enabled**, **no policies** (deny for non-bypass roles).
- `anon`/`authenticated` revoked.
- `service_role` / `postgres` have INSERT.
- App uses `DATABASE_URL` service/direct pool → **can insert**. Not the root cause of 0 rows.

---

## 22. Deployed-code findings

- Activation migration + API + client activator: commit `2a20b56` (2026-09-09).
- Completion wiring: `23b80d8` / `c761956` (2026-09-09).
- Vercel production SHA at MUSE time: **not retrieved** (API 403).
- Route present in production preflight inventory (`audit/launch-day-gate-3a-vercel-production-preflight.md`).

---

## 23. Primary root-cause classification

## `F — MULTIPLE FAILURE MODES`

Supporting modes (same root architecture):

1. Unmount / View Market abort during wait or activation  
2. Index wait timeout → activation never attempted  
3. POST failure ×2 → `news_activation_failed` → pending cleared → permanent  
4. No server durable intent / backfill from `launch_drafts` ↔ token  

Not primary alone: A (caller exists), B (drafts prove provenance was known server-side), C (caller waits for index; not “before indexing permanently” by design), D (API/DB would work today), E (feature predates MUSE/2HAWK/T110).

---

## 24. Minimal broken invariant

> The relationship is lost because **news↔market linking is a non-durable, abortable browser side-effect after launch, not a server-guaranteed write when a news draft and indexed launch both exist.**

---

## 25. Architecture salvageable?

```text
YES — current join table/API can be retained
```

Reasons (≤3):

1. `news_article_markets` + `linkNewsArticleMarket` + news feed joins are already the right durable model.
2. Production emptiness is a **write-path reliability** problem, not a schema mismatch.
3. MUSE’s inputs already satisfy insert preconditions — persistence, not redesign, is missing.

---

## 26. Confirmation

No production changes, no activation POSTs, no row inserts, no migrations, no MUSE mutations. Read-only inspection only.

---

## Step 2 answer

> **ROOT CAUSE:** Linking depends on an abortable client POST after index wait, with no durable server intent—so launches can go live while `news_article_markets` is never written.

> **PRIMARY CLASSIFICATION:** F

> **CURRENT ARCHITECTURE SALVAGEABLE:** YES

> **WHY PRODUCTION HAS ZERO ROWS:** The only writer never successfully completed for any news-origin market (including MUSE/2HAWK/T110); API/DB are capable, but client lifecycle/timeout/failure paths drop the link permanently without server recovery.

> **NEXT STEP:** Step 3 should design the smallest reliable persistence mechanism only after this report is reviewed.

**STOP**
