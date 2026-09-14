# Incident Audit — Missing Image + Lore after Render Build Outage

**Token:** `0x9497906bc267abdb7e7e1ce64180e53f82e92352` (Doomer Swat / SWAT)

## 1. Verdict

`PARTIAL — ROOT CAUSE FOUND, ONE OR MORE RECOVERY PATHS FAILED`

## 2. Observed UTC timestamp

`2026-09-14T22:21:44Z`

## 3. Branch

`main`

## 4. HEAD

`df74b3fb77d0c712b470581c533a6082d32b4def`

## 5. Git status

Dirty workspace with unrelated untracked `P10.4-*` / audit files and modified `audit/deterministic-token-image-binding.md`. No functional code changes made for this audit.

## 6. Target token identity

| Field | Value |
| --- | --- |
| name | Doomer Swat |
| symbol | SWAT |
| chain_id | 4663 |
| token | `0x9497906bc267abdb7e7e1ce64180e53f82e92352` |
| deployer | `0x025f3f91f7f3242abf93bafb7d29b96af548937a` |
| quote | `0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec` (NVDA catalogue) |
| pool | `0x1adfb539be2976209d769a45e854765acaca78644d09d935daf0fab925905fe5` |

## 7. Launch tx / block / timestamp

| Field | Value |
| --- | --- |
| launch_tx_hash | `0xbb724fac1aefb65bc3e1b05e6898df8556b8c722f2accce2aeb1adcf66b49b8a` |
| launch_block | `63142182` |
| launches.launched_at | `1789422911` → `2026-09-14T20:55:11Z` (chain clock) |
| tokens.created_at | `2026-09-14T21:55:19.888Z` (indexer wall clock) |
| draft created_at | `2026-09-14T21:53:59.539Z` |

Wall-clock launch identity is ~`21:54–21:55Z` (draft → pin intent → token row). Chain `launched_at` is ~1h earlier than token insert wall time; both are recorded.

## 8. Exact Render service incident

**Primary impacted service:** `scoop-app` background worker  
**ID:** `srv-daenmj6q1p3s73a4long`  
**Role:** canonical indexer / launch+token projection (+ on-insert image enrichment attempt)

Between `2026-09-14T21:50Z` and `22:06Z`, multiple deploys of `df74b3f` **build_failed in <1s** (triggers: `new_commit`, `api`, `service_resumed`, `service_updated`) — consistent with **build pipeline minutes exhausted** (fails before a real build). A later **manual** deploy `dep-dak712h594qs738ka7l0` became **live** at `22:11:55Z` on `df74b3f`.

Important: this was **deploy/build blocked**, not proof that the already-running worker was unable to index. This token **was indexed** at `21:55:19Z`.

## 9. Service status / deployed SHA

| Service | ID | Role | SHA around launch | Notes |
| --- | --- | --- | --- | --- |
| scoop-app | `srv-daenmj6q1p3s73a4long` | indexer | live lineage through `cdc1ffe` until manual `df74b3f` @ `22:11Z` | build failures `21:50–22:06`; token indexed `21:55` |
| scoop-news-ingest | `crn-dahst0rm8hqs73d8p9pg` | news cron | `df74b3f` live | not on image/Lore bind path |
| scoop-fee-keeper | `crn-dahapbv40ujc73e9ptq0` | fee cron | `df74b3f` live | unrelated |
| scoop-holder-rewards | `crn-dajr06uq1p3s73a5j57g` | holder cron | `029c2ea` still live; `df74b3f` build_failed | unrelated |

**Vercel production SHA:** `df74b3f` (Ready / success)

### Phase B table

| Service | Role | Running at launch? | Deploy blocked? | Relevant to image? | Relevant to Lore? |
| --- | --- | ---: | ---: | ---: | ---: |
| scoop-app | canonical indexer | YES (indexed token @ 21:55) | YES (new builds `21:50–22:06`) | YES (apply-on-insert enrichment) | NO (does not write news links) |
| scoop-news-ingest | news ingest cron | n/a to this launch | no evidence needed | NO | NO (ingest ≠ Lore link) |
| scoop-fee-keeper | fee keeper | n/a | n/a | NO | NO |
| scoop-holder-rewards | holder rewards | n/a | `df74b3f` build failed | NO | NO |
| Vercel web + crons | bind APIs + reconcile | YES (site/API live) | NO | YES (receipt bind + `/api/cron/reconcile-token-display`) | YES (activation + `/api/cron/reconcile-news-article-markets`) |

## 10. Canonical indexing state

```text
CANONICAL TOKEN INDEXED: YES
CANONICAL LAUNCH INDEXED: YES
POOL INDEXED: YES
MARKET STATE AVAILABLE: YES
```

Checkpoint at audit: `last_block_number=63154387` (> launch block `63142182`). Incident is **downstream of indexing**.

## 11. Image provenance

| Field | Value |
| --- | --- |
| image_uri | `ipfs://bafybeihxg3y5oiwkmqycsfiisaawj66uwo67x7lsyphdpfktfgrdj7kufy` |
| display_image_url | **null** |
| draft_id | `71649551-d5a2-42c9-8c53-0f4af8a5a401` |
| artwork | AI (`gpt-image-2`), selected, 1024×1024 PNG |
| display_image_path | `drafts/71649551-…/09293c8c-…/ed4db784f35650a8.png` |
| provenance | **AI-generated** (news draft artwork) |

## 12. Image intent state

| Field | Value |
| --- | --- |
| intent id | `39b48e70-83fc-4815-91bc-c410c76a4647` |
| status | **`awaiting_token`** |
| attempts | `0` |
| last_error | null |
| chain_id | **null** |
| token_address | **null** |
| created_at / updated_at | `2026-09-14T21:55:01.897Z` / **unchanged** |

Intent exists and predates token row by ~18s. Never bound, never finalized.

## 13. First broken image edge

State machine:

```text
pin: PASS (intent + path + image_uri created)
intent created: PASS
receipt bind: FAIL / NOT APPLIED (still awaiting_token, token_address null)
token address attached: NO
pending state: NO (stuck awaiting_token)
indexer apply-on-insert: FAIL (see below — intent matchable but URL build impossible)
cron reconciliation: FAIL / NOT EFFECTIVE (row never updated after create)
display_image_url written: NO
intent done: NO
```

**First broken edge:** receipt-time bind did not attach the token to the existing intent.

**Independent second failure:** even without receipt bind, indexer `applyBoundDisplayImageOnTokenInsert` can match `awaiting_token` by `image_uri`. That path still cannot write `display_image_url` because **Render `scoop-app` has no `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` env vars** (confirmed via Render API env-var list). `buildPublicTokenImageUrl(path, null)` returns null → enrichment no-ops without marking intent done.

**Third failure:** Vercel recovery cron did not move this intent (unchanged `updated_at`, still `awaiting_token`) for ≥25 minutes despite `*/2` schedule and a uniquely matchable token.

## 14. Underlying image asset health

| Check | Result |
| --- | --- |
| Supabase public object | HTTP 200, `image/png`, 1 740 071 bytes, 1024×1024 |
| IPFS gateways (`ipfs.io` / `dweb.link`) | HTTP **429** from this auditor host |
| Asset vs binding | Asset healthy; binding not |

```text
UNDERLYING IMAGE ASSET HEALTHY: YES
IMAGE BINDING HEALTHY: NO
```

## 15. Frontend image path

Production API `GET /api/tokens/0x9497…`:

- `displayImageUrl`: **null**
- `imageUri`: present (`ipfs://bafybei…`)

Production page renders:

```html
<img src="https://ipfs.io/ipfs/bafybeihxg3y5oiwkmqycsfiisaawj66uwo67x7lsyphdpfktfgrdj7kufy" alt="Doomer Swat" …>
```

Layer where image “disappears”: **DB lacks `display_image_url`** → UI falls back to `ipfs.io` → gateway rate-limit/unreliability makes art appear missing. Not an API omission of a populated display URL.

## 16. Image Render-causality classification

**C — Render outage unrelated; image path failed elsewhere**

Evidence:

- Build-minute failures blocked **new deploys**, but this token was still canonically indexed.
- Image break is: missing receipt bind + missing Supabase env on indexer + ineffective Vercel cron recovery.
- Missing `SUPABASE_URL` is a **Render service configuration defect**, distinct from the build-pipeline outage window.

## 17. News provenance

```text
NEWS-ORIGIN TOKEN: YES
draft_id: 71649551-d5a2-42c9-8c53-0f4af8a5a401
source_type: news
provider: stocknewsapi
provider_article_id: sna_url_32431ddd916afc1e69327690
article exists: YES
headline: Nvidia CEO Jensen Huang swats down AI doomerism
article URL: https://www.businessinsider.com/nvidia-ceo-jensen-huang-ai-doomerism-lacks-scientific-basis-2026-9
```

## 18. News intent state

```text
news provenance present: YES
intent created: NO
intent status: n/a
attempts: n/a
last_error: n/a
token bound: NO
```

No row in `news_article_market_intents` for this token (only older Step-3 backfill intents for MUSE/2HAWK/T110 exist in the nearby window).

## 19. Durable news join state

`news_article_markets`: **0 rows** for this token.  
`GET /api/news/sna_url_32431ddd916afc1e69327690/markets`: empty items expected.

## 20. First broken Lore edge

```text
news provenance present: YES
intent created: NO   ← first broken edge
durable join row created: NO
article exists: YES
Lore query returns article: NO
```

Lore recovery cron only reconciles **existing pending intents**. With no intent, Lore cannot self-heal.

## 21. Lore API / read-path state

Token page has **no** `data-testid="token-lore"` / Lore section.  
`loadTokenPage` → `getNewsArticleLoreForToken` requires `news_article_markets` join — absent → Lore omitted. Correct given missing durable link.

## 22. Lore Render-causality classification

**C — Render outage unrelated; Lore path failed elsewhere**

Lore durability is owned by Vercel/web (`upsertNewsArticleMarketIntentAndLink` + reconcile cron). Render indexer does not create news intents. Canonical launch already exists; Render downtime did not block the DB prerequisite for linking.

## 23. Image vs Lore comparison

| Stage | Image pipeline | Lore pipeline |
| --- | --- | --- |
| draft provenance exists | YES | YES |
| durable intent exists | YES (`awaiting_token`) | **NO** |
| token address bound | NO | NO |
| requires canonical launch/token | for finalize / apply | YES for `news_article_markets` |
| browser fast-path | receipt bind missing | activation POST missing |
| Render-owned recovery | apply-on-insert (broken: no Supabase env) | none |
| Vercel cron recovery | should bind+finalize; **did not update row** | cannot run without intent |
| current status | MISSING DISPLAY / PENDING INTENT | MISSING INTENT |
| first broken edge | receipt bind not applied | intent never created |

```text
SAME ROOT CAUSE: PARTIAL
```

Shared theme: browser completion fast-path did not finish durable server writes. Divergent: image has a pin-time intent (recoverable); Lore has no intent (must be created from draft).

## 24. Cron deployment / schedule / auth

Both routes deployed on production Vercel (`x-matched-path` observed):

| Route | Schedule (`apps/web/vercel.json`) | Auth |
| --- | --- | --- |
| `/api/cron/reconcile-token-display` | `*/2 * * * *` | Bearer `CRON_SECRET` **or** `x-vercel-cron: 1` **or** internal secret |
| `/api/cron/reconcile-news-article-markets` | `*/2 * * * *` | same |

Unauthenticated GET returns:

`401` `Internal route disabled — set SCOOP_INTERNAL_API_SECRET`

→ routes are live; anonymous calls fall through to internal auth. Real Vercel cron must send `x-vercel-cron` / Bearer.

**Cron invocations are not dependent on Render.**

## 25. Cron invocation evidence

No production write/mutate calls were made.

Indirect evidence only:

- Image intent `updated_at == created_at`, status still `awaiting_token`, attempts `0` despite unique token match for `bindAwaitingDisplayFinalizeIntents` (simulated read-only query returns the token inside lookback).
- Therefore reconcile-token-display **did not successfully process this intent** after launch.
- News cron irrelevant here (no pending news intent).

## 26. Indexer recovery timeline

| Metric | Value |
| --- | --- |
| current indexed block | `63154387` |
| target launch block | `63142182` |
| indexer checkpoint stream | `main` / chain `4663` |
| lag vs tip | near-tip (worker live post-`22:11`) |
| passed target block? | YES (token/launch rows exist) |
| time indexed | `tokens.created_at = 2026-09-14T21:55:19.888Z` |

Indexer passed the launch **and still left image intent unresolved**.

## 27. Target launch timeline (evidence-backed)

| ID | Event | Timestamp (UTC) |
| --- | --- | --- |
| T0/T1/T2 | draft ready / pin / receipt window | draft `21:53:59`; intent `21:55:01` |
| T3/T4 | canonical launch+token indexed | `21:55:19` |
| T5 | image intent created | `21:55:01` (`awaiting_token`) |
| T6 | image finalize attempted | receipt bind: no; indexer enrich: attempted path exists but cannot build URL without Supabase env |
| T7 | display_image_url written | **never** |
| T8 | news-link intent created | **never** |
| T9 | news_article_markets written | **never** |
| T10 | Lore exposable | **never** |
| T11 | scoop-app healthy on `df74b3f` | deploy live `22:11:55` |

## 28. Nearby-launch blast-radius check

Tokens with `created_at` in `21:40–22:20Z`: **only SWAT**.

Open image intents globally at audit: this single `awaiting_token` row.  
Open news intents: none.

```text
BLAST RADIUS: SINGLE TOKEN
```

(with systemic risk notes below — config/cron — not a multi-token outage window in DB)

## 29. API / frontend verification

| Check | Result |
| --- | --- |
| token API | 200 / healthy market fields |
| display_image_url exposed | no (null) |
| image_uri exposed | yes |
| Lore object | absent |
| image visible | fallback `ipfs.io` src present; gateway 429 → effectively broken UX |
| Lore visible | no |
| expected article | Business Insider Huang / AI doomerism |

## 30. Image root cause

> Pin created a durable `awaiting_token` intent with a healthy Supabase object, but receipt bind never attached the token; indexer on-insert enrichment cannot write `display_image_url` because `scoop-app` lacks Supabase URL env; Vercel reconcile cron did not advance the intent — so UI falls back to flaky `ipfs.io`.

## 31. Lore root cause

> News-origin draft/article exist, but no `news_article_market_intents` row was ever created for this token, so no `news_article_markets` join and no Lore; cron cannot invent a missing intent.

## 32. Render relationship

> Build-pipeline exhaustion blocked redeploys of `scoop-app` around `21:50–22:06`, but did **not** prevent canonical indexing of this launch. It is coincidental timing relative to missing Lore. For image, Render matters as the indexer enrichment host **misconfigured without Supabase URL**, not because the worker failed to see the launch.

## 33. Incident severity

**IMPORTANT**

This token is broken on image/Lore but repairable from trusted provenance. However:

- missing Supabase env on indexer is a **systemic** enrichment defect;
- Lore still depends on browser/API creating an intent (no intent ⇒ no cron heal).

Not MINOR (not cache). Not yet proven as a multi-token outage window.

## 34. Smallest safe image repair (next task — DO NOT EXECUTE)

`BIND EXISTING INTENT` / `RECONCILE EXISTING INTENT`

Use existing intent `39b48e70-…` (path + image_uri trusted) → bind token → set `tokens.display_image_url` from known Supabase public URL.

Also fix Render env: add `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) on `scoop-app` so future on-insert enrichment works.

## 35. Smallest safe Lore repair (next task — DO NOT EXECUTE)

`CREATE MISSING INTENT FROM TRUSTED PROVENANCE`

Call `upsertNewsArticleMarketIntentAndLink` with draft `71649551-…` / article `sna_url_32431ddd916afc1e69327690` / token `0x9497906b…` (launch already indexed → should link immediately).

## 36. Code / config fix required?

**YES** (config + possible cron ops), not a protocol/indexer lag change:

1. Set Supabase URL on Render `scoop-app`.
2. Verify Vercel cron actually invokes reconcile routes with auth headers; investigate why this awaiting intent was never touched.
3. Optional product hardening (future): ensure news intent persistence cannot be skipped if draft provenance exists server-side at receipt.

## 37. Confirmation: no production writes

Read-only audit only. No DB writes, no reconcile POSTs, no repairs, no deploys, no Render changes, no code changes beyond this report file.

---

## Incident answer

> **VERDICT:** PARTIAL — ROOT CAUSE FOUND, ONE OR MORE RECOVERY PATHS FAILED

> **TOKEN:** `0x9497906bc267abdb7e7e1ce64180e53f82e92352`

> **CANONICAL LAUNCH INDEXED:** YES

> **RENDER SERVICE DOWN/IMPACTED:** scoop-app (`srv-daenmj6q1p3s73a4long`) — build pipeline blocked; running worker still indexed this token

> **IMAGE ROOT CAUSE:** Intent stuck `awaiting_token` (no receipt bind); indexer cannot finalize without Supabase env; cron did not heal; UI falls back to rate-limited IPFS.

> **IMAGE RENDER CAUSALITY:** C

> **IMAGE CURRENT STATE:** PENDING

> **LORE ROOT CAUSE:** News-origin draft exists but no news↔market intent/row was ever created, so Lore read path correctly returns nothing.

> **LORE RENDER CAUSALITY:** C

> **LORE CURRENT STATE:** MISSING INTENT

> **SAME ROOT CAUSE:** PARTIAL

> **BLAST RADIUS:** SINGLE TOKEN

> **CODE FIX REQUIRED:** YES

> **SAFE NEXT ACTION:** Bind/reconcile existing image intent; create news intent from draft `71649551-…`; add Supabase URL to Render indexer env — do not execute in this task.

> **NEXT STEP:** Stop and return this report for review before any repair.
