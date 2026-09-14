# Lore Missing — KEY (`0x587ed3fd…`)

## 1. Verdict

`BLOCKED — POST-FIX NEWS DURABILITY IS STILL FAILING`

## 2. Observed UTC timestamp

`2026-09-14T22:58:49Z`

## 3. Branch

`main`

## 4. Pre-HEAD

`555cddde89a748c565a7ddec614b42981b116c31`

## 5. Final HEAD

_(set after commit)_

## 6. Git status

Task files only staged for commit. Unrelated untracked `P10.4-*` / older audits left untouched. Unrelated local edit to `audit/deterministic-token-image-binding.md` not included.

## 7. Vercel production SHA/status

At audit start: production Serving `555cddd` Ready. Includes durability ancestor `817eee3` (deploy create ~`2026-09-14T22:39:43Z`). Post-commit push expected to cut over to this task’s SHA (verify after Ready).

## 8. Render scoop-app SHA/status

Live @ `555cddd` at audit time. No Render redeploy required for this web-route hardening.

## 9. Target token identity

| Field | Value |
| --- | --- |
| address | `0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8` |
| name/symbol | Key Level / KEY |
| chain | 4663 |
| created_at | `2026-09-14T22:54:13.782Z` |
| launch tx | `0xd5ea7ece6fcdd6a4e20d0b62242b3a8efaeb65aad8a4c919c07c498c8893ec4c` |
| launch block | `63177021` |
| deployer | `0x025f3f91f7f3242abf93bafb7d29b96af548937a` |
| quote | native zero address |
| pool | `0xa775c4f1…59d277` |

## 10. Canonical indexing

```text
CANONICAL TOKEN INDEXED: YES
CANONICAL LAUNCH INDEXED: YES
POOL INDEXED: YES
```

## 11–12. Associated draft / news-origin

| Field | Value |
| --- | --- |
| draft_id | `5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08` |
| source | `token_display_finalize_intents.draft_id` (intent done) |
| source_type | `news` |
| provider | `stocknewsapi` |
| provider_article_id | `sna_url_3b57d128669634d12ddc6154` |
| draft created | `2026-09-14T22:52:24.960Z` |

```text
NEWS-ORIGIN TOKEN: YES
```

## 13–14. Article

Headline: `Nasdaq Tests Key Level On AI Warnings Ahead Of Fed Meeting; Nvidia, Sandisk, Micron Tumble`  
URL: `https://www.investors.com/market-trend/the-big-picture/dow-jones-sp500-nasdaq-ai-fed-rates-warsh/`  
Domain: `investors.com`

```text
ARTICLE EXISTS: YES
```

## 15. News intent

```text
NEWS INTENT EXISTS: NO
NEWS INTENT STATUS: n/a
```

## 16–17. Durable join / conflicts

```text
DURABLE NEWS LINK EXISTS: NO
```

No duplicate/conflict rows (nothing linked).

## 18–19. State machine / first broken edge

```text
news draft provenance: PASS
receipt token identity: PASS
intent persistence: FAIL   ← first broken edge
canonical launch prerequisite: PASS (would allow join)
durable join: FAIL
Lore DB query: FAIL (null — no join)
server loader: FAIL (no lore to load)
client prop handoff: N/A
render condition: PASS (correctly hides when lore null)
```

**First broken edge:** durable `news_article_market_intents` row was never created despite news draft + successful image bind that retained `draft_id`.

## 20. `getNewsArticleLoreForToken`

`null` → **FAIL**

## 21–23. Loader / client / render

Lore is SSR via `loadTokenPage` → `getNewsArticleLoreForToken`. No lore → no section. Render condition `{lore && loreHref ? …}` is correct. Token API does not expose lore (SSR-only by design).

## 24. Production token API

No lore fields (expected). Image display URL present.

## 25. Live page

`https://scoop.fun/token/0x587ed3fd…` — image OK, market OK, **no** `token-lore` / Lore heading.

## 26–29. Timing

| Event | UTC |
| --- | --- |
| Durability impl deploy created | `817eee3` @ `2026-09-14T22:39:43Z` |
| Draft created | `22:52:24Z` |
| Display intent created | `22:53:51Z` |
| Token indexed | `22:54:13Z` |
| Production SHA at launch | at/after `555cddd` / definitely after `817eee3` |

```text
TOKEN LAUNCHED AFTER DURABILITY FIX LIVE: YES
```

## 30. Durability code-path verification

At HEAD: await-before-index, keepalive, draftId forward, dual-write when **body** `draftId` present — all present.

Evidence this launch exercised **display bind** (intent `done`, display URL set) but **not** news intent persistence.

Likely gap: dual-write gated only on request-body `draftId`. Bind can succeed via `image_uri` match while client omits `draftId`, even though the pin-time intent already stores `draft_id=5b992fb0-…`. Separate `activateNews` also skipped if client provenance empty.

## 31. Reconcile

N/A — no pending intent to reconcile.

## 32. Blast radius

Post-durability sample: KEY (no intent/nam) vs SWAT (done/nam, repaired earlier).

```text
BLAST RADIUS: POST-FIX SYSTEMIC (at least intermittent / provenance-gap)
```

## 33. Root-cause classification

**B — No durable intent was created post-fix**

## 34–35. Data repair required

**YES** — do **not** execute in this task.

Trusted repair inputs:

```text
upsertNewsArticleMarketIntentAndLink({
  chainId: 4663,
  tokenAddress: '0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8',
  draftId: '5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08',
  provider: 'stocknewsapi',
  providerArticleId: 'sna_url_3b57d128669634d12ddc6154',
})
```

Expected: intent `done` + `news_article_markets` row + Lore headline/URL above.

## 36–37. Code fix

**YES (future-path write hardening only; KEY data not mutated):**

| File | Change |
| --- | --- |
| `apps/web/src/lib/launch/bind-token-display-image.ts` | Success results include `draftId` from the bound intent |
| `apps/web/src/app/api/launch/display-image/bind/route.ts` | Dual-write uses `body.draftId \|\| result.draftId` |
| `apps/web/src/lib/launch/bind-token-display-image.test.ts` | KEY regression: intent draft returned when client omits `draftId` |

## 38–40. Tests / build / deploy

- `vitest` bind-token-display-image: **9 passed**
- `@scoop/web` typecheck: **pass**
- Push `main` for Vercel (no Render). KEY Lore remains absent until separate data repair.

## 41. Production verification

KEY page still without Lore (expected until repair). Hardening applies to subsequent news-origin binds once Vercel Ready on this SHA.

## 42. Launch blocker assessment

**YES** — news-origin launch after durability still lost Lore link → durability guarantee incomplete until dual-write uses intent draft + KEY repaired.

## 43. No unauthorized production mutation

Confirmed — read-only DB for KEY; no backfill.

---

## Lore investigation answer

> **VERDICT:** BLOCKED — POST-FIX NEWS DURABILITY IS STILL FAILING

> **TOKEN:** `0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8`

> **NEWS-ORIGIN TOKEN:** YES

> **DRAFT ID:** `5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08`

> **ARTICLE EXISTS:** YES

> **NEWS INTENT EXISTS:** NO

> **NEWS INTENT STATUS:** N/A

> **DURABLE NEWS LINK EXISTS:** NO

> **LORE REPOSITORY QUERY:** FAIL

> **SERVER LOADER HAS LORE:** NO

> **CLIENT RECEIVES LORE:** NO

> **LORE RENDER CONDITION CORRECT:** YES

> **TOKEN LAUNCHED AFTER DURABILITY FIX LIVE:** YES

> **FIRST BROKEN EDGE:** News intent was never persisted (image bind succeeded with draft_id on the display intent, but news dual-write/activate did not create `news_article_market_intents`).

> **ROOT CAUSE CLASSIFICATION:** B

> **DATA REPAIR REQUIRED:** YES

> **CODE FIX REQUIRED:** YES (intent-draft dual-write hardening; KEY still needs separate repair)

> **BLAST RADIUS:** POST-FIX SYSTEMIC

> **LAUNCH BLOCKER:** YES

> **NEXT STEP:** Stop and return this report for review before any production data repair.
