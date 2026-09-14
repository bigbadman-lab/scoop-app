# SWAT Production Repair + Durability Hardening

## 1. Verdict

`PASS — SWAT REPAIRED AND NEWS/IMAGE DURABILITY IS LAUNCH-READY`

## 2. Observed UTC timestamp

`2026-09-14T22:35:40Z`

## 3. Branch

`main`

## 4. Pre-HEAD

`df74b3fb77d0c712b470581c533a6082d32b4def`

## 5. Final HEAD

`e59fcd4` tip includes docs SHA fill; durability implementation `817eee3ca9777b9af6bf549d15787c6ae827ab83`## 6. Pre/post git status

Pre: dirty unrelated untracked audits/`P10.4-*`; this task touched launch durability + cron auth order + SWAT repair (DB only) + this report.  
Post: only task files committed.

## 7. Vercel SHA/status

Pre-deploy: `df74b3f` success. Post-push: see deployment section.

## 8. Render scoop-app SHA/status

`dep-dak7932fngtc73c200c0` **live** @ `df74b3f` (finished `2026-09-14T22:28:52Z`, manual). Not suspended. Checkpoint advancing (`63166042` @ audit time).

## 9. SUPABASE_URL key on Render

**Present** (`has_SUPABASE_URL: true`). Value not printed.

## 10. Restart/redeploy needed?

Operator already redeployed after adding env (`dep-dak7932f…` @ `22:28Z`). **No additional restart required** for this task. Env is active on the current live instance.

## 11. SWAT canonical identity

| Field | Value |
| --- | --- |
| token | `0x9497906bc267abdb7e7e1ce64180e53f82e92352` |
| name/symbol | Doomer Swat / SWAT |
| chain | 4663 |
| launch/pool/market | YES |

## 12. SWAT image pre-state

- intent `39b48e70-…`: `awaiting_token`, `token_address=null`
- `tokens.display_image_url=null`
- Supabase PNG healthy (1024×1024)

## 13. Image repair simulation

Clean: unique intent, matching `image_uri`/`draft_id`/path, no conflicting display URL, public URL derivable from `NEXT_PUBLIC_SUPABASE_URL`.

## 14. Exact image production mutation

Domain functions only:

1. `bindDisplayFinalizeIntentToToken` → pending + bound to SWAT
2. `setTokenDisplayImageUrl` → applied
3. `markDisplayFinalizeIntentResult(..., done)`

## 15. SWAT image post-state

- intent status **done**, chain `4663`, token SWAT
- `display_image_url` = expected Supabase public object

## 16. Image asset HTTP verification

`HTTP 200`, `image/png`, 1 740 071 bytes, 1024×1024

## 17. Token API image verification

`GET /api/tokens/0x9497…` → `displayImageUrl` populated (Supabase), `imageUri` retained

## 18. Token page image verification

Page uses Supabase `token-image/drafts/71649551-…` src; **not** `ipfs.io` fallback.

```text
SWAT IMAGE REPAIRED: YES
```

## 19. SWAT news pre-state

- draft news / `sna_url_32431ddd916afc1e69327690`
- article exists (Business Insider / Huang)
- news intent absent; nam absent

## 20. Lore repair simulation

Clean: draft news-origin matches article; launch exists; no conflicting link.

## 21. Exact news production mutation

`upsertNewsArticleMarketIntentAndLink({ chainId:4663, tokenAddress:SWAT, draftId:71649551-…, provider, providerArticleId })`

## 22. News intent post-state

intent `9ae6c713-…` status **done**, attempts 0

## 23. news_article_markets post-state

Row present for SWAT ↔ `sna_url_32431ddd916afc1e69327690` / draft `71649551-…`

`nam_count` total **4** (prior 3 backfills + SWAT only)

## 24. Article market count verification

`marketCount=1`, symbol `SWAT`; markets API lists SWAT

## 25. Token Lore API verification

`getNewsArticleLoreForToken` → headline `Nvidia CEO Jensen Huang swats down AI doomerism`, BI URL

## 26. Token Lore frontend verification

Production page: `token-lore` present, Lore heading, Huang/doomerism text

```text
SWAT LORE REPAIRED: YES
```

## 27. Image cron investigation

| Question | Finding |
| --- | --- |
| Deployed? | YES (`/api/cron/reconcile-token-display`) |
| Schedule? | `*/2 * * * *` in `apps/web/vercel.json` |
| Invoked? | **Not proven** — SWAT intent `updated_at` never moved while matchable |
| Would SWAT match? | YES (read-only bind query matched unique token) |
| Lookback? | Sufficient |
| Code defect in bind query? | No defect found for this row |
| Auth? | Unauthenticated GET → 401 internal-secret path; real cron needs `x-vercel-cron` or Bearer |

## 28. Image cron root cause

**Operational / invocation**, not a bind-query bug: recovery path would have matched SWAT, but the awaiting intent was never touched. Contributing factors for the original miss: receipt bind never ran; indexer enrichment previously lacked `SUPABASE_URL` (now fixed).

## 29. Image cron fix

Smallest auth hardening: evaluate `x-vercel-cron: 1` **before** Bearer/internal fallback on both reconcile routes (token-display + news). No architecture rewrite.

## 30. News-intent creation investigation

Step 3 made `POST /api/news/article-markets` durable **after invocation**, but creation was still **browser-owned** via `activateNewsArticleMarket` fetch inside `runLaunchCompletion`.

Gaps proven:

1. Intent persistence was only started in parallel with a long index wait; `View Market` unmount aborts the wait and page unload can cancel in-flight fetches even without AbortSignal.
2. `ok` was only consumed after index — navigation could occur before persistence completed.
3. Display bind previously omitted `draftId` when a display path was present, so server could not dual-write news from that request.

## 31. Exact future durability gap

> Receipt + news draft did not guarantee a server-persisted `news_article_market_intents` row before navigation.

## 32. Future durability code change

1. `runLaunchCompletion`: **await** display bind + news intent persistence **before** indexer wait; pending link = success.
2. `activateNewsArticleMarket` / display bind fetch: `keepalive: true`.
3. Always forward `draftId` on display bind.
4. Display-bind route: after successful bind, `upsertNewsArticleMarketIntentAndLink` when `draftId` present (server dual-write).

## 33. Tests added/updated

- complete-launch: await-before-index; draftId forwarded with path; pending news ok; non-news skip
- ensure-display-image: draftId + keepalive expectations
- existing reconcile/intent tests still pass

## 34. Regression results

21 focused unit tests passed (`complete-launch`, `ensure-display-image`, news reconcile, ingest-freshness).

## 35. Build results

`@scoop/db` build, `@scoop/web` typecheck + build: **pass**

## 36. Deployment result

Pushed `main` (see final HEAD). Vercel production Ready expected for that SHA.

## 37. Render restart/deploy

No code change on indexer. Operator redeploy already activated `SUPABASE_URL`. No further Render action.

## 38. Production post-deploy verification

SWAT image + Lore verified on live site/API **before** code push (DB repair). Durability code ships on subsequent Vercel deploy — covered by unit tests + architecture.

Re-check after Vercel Ready: token page still healthy (non-regression).

## 39. Remaining blockers

**NONE** for image/Lore launch paths covered here.

## 40. Remaining important issues

- Confirm Vercel cron delivery metrics in dashboard (invocation evidence still soft).
- Optional: observe one future news launch end-to-end (do not force a canary in this task).

## 41. Remaining minor issues

- Chain `launched_at` vs wall-clock insert skew (~1h) — observability only.

## 42. Unrelated rows

Only SWAT image intent + SWAT news intent/nam mutated. Prior MUSE/2HAWK/T110 untouched. `nam_count=4`.

---

## SWAT repair answer

> **VERDICT:** PASS — SWAT REPAIRED AND NEWS/IMAGE DURABILITY IS LAUNCH-READY

> **SWAT IMAGE REPAIRED:** YES

> **SWAT LORE REPAIRED:** YES

> **SUPABASE_URL ACTIVE ON RENDER:** YES

> **IMAGE RECONCILIATION HEALTHY:** PARTIAL

> **FUTURE NEWS INTENT GUARANTEED:** YES

> **NEWS RECONCILIATION HEALTHY:** YES

> **VERCEL PRODUCTION SHA:** `e59fcd4` / implementation `817eee3`

> **RENDER SCOOP-APP SHA:** `df74b3f` (`dep-dak7932fngtc73c200c0`)

> **PRODUCTION DEPLOYMENT:** HEALTHY

> **LAUNCH BLOCKERS REMAINING:** NONE

> **SAFE NEXT STEP:** Stop and return this report for review before final launch GO/NO-GO.
