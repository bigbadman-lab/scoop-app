# KEY Lore Repair + Post-Fix News Durability Closure

## 1. Verdict

`PASS — KEY REPAIRED AND POST-FIX NEWS DURABILITY BLOCKER CLOSED`

## 2. Observed UTC timestamp

`2026-09-14T23:16:43Z`

## 3. Branch

`main`

## 4. Pre-HEAD

`2b0a2fa6651dfdf56a92e2234974687fdd20d6a3`

## 5. Final HEAD



## 6. Git status

Unrelated untracked `P10.4-*` / older audits left untouched. Unrelated local edit to `audit/deterministic-token-image-binding.md` not included.

## 7. Hardening implementation SHA

`f72aa98aa65d76eb97ff3bf529e5f4ce05bb7842`

Contains:

- `bindAndFinalizeTokenDisplayImage` success result includes trusted intent `draftId`
- display-image bind route uses `body.draftId || result.draftId`
- KEY regression test (bind without client `draftId`)

Ancestor of tip `2b0a2fa`.

## 8. Vercel production SHA/status

| Field | Value |
| --- | --- |
| production SHA | `2b0a2fa6651dfdf56a92e2234974687fdd20d6a3` |
| deployment status | success (`Deployment has completed`) |
| deployment created | `2026-09-14T23:06:07Z` |
| environment | Production (GitHub deployment `6448191644`) |
| source | GitHub Deployments API (Vercel CLI token expired; not used) |

## 9. Hardening live before repair

```text
HARDENING LIVE ON VERCEL: YES
```

Confirmed before KEY write: Production success on `2b0a2fa` (includes `f72aa98`).

## 10. KEY canonical identity

| Field | Value |
| --- | --- |
| chain_id | `4663` |
| token_address | `0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8` |
| name / symbol | Key Level / KEY |
| tokens | YES |
| launches | YES (`0xd5ea7ece…`, block `63177021`) |
| pool | YES (`0xa775c4f1…59d277`) |

## 11. KEY draft provenance

| Field | Value |
| --- | --- |
| draft_id | `5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08` |
| source_type | `news` |
| provider | `stocknewsapi` |
| provider_article_id | `sna_url_3b57d128669634d12ddc6154` |

## 12. Article identity

| Field | Value |
| --- | --- |
| title | Nasdaq Tests Key Level On AI Warnings Ahead Of Fed Meeting; Nvidia, Sandisk, Micron Tumble |
| url | `https://www.investors.com/market-trend/the-big-picture/dow-jones-sp500-nasdaq-ai-fed-rates-warsh/` |
| source_domain | `investors.com` |
| exists | YES |

## 13–14. Pre-repair state

```text
news_article_market_intents: ABSENT (0)
news_article_markets for KEY: ABSENT (0)
conflicts on article: none
news_article_markets total: 4
```

## 15. Repair simulation

Prechecks via domain inputs:

- draft news-origin + provider/article match: PASS
- article exists: PASS
- canonical launch indexed: PASS
- no conflicting KEY link: PASS
- expected intent status: `done`
- expected `news_article_markets` delta: +1
- blast radius: KEY intent/join only

## 16. Exact production mutation

Single controlled call:

```text
upsertNewsArticleMarketIntentAndLink({
  chainId: 4663,
  tokenAddress: '0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8',
  draftId: '5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08',
  provider: 'stocknewsapi',
  providerArticleId: 'sna_url_3b57d128669634d12ddc6154',
})
```

Result: `{ ok: true, linked: true, intent.status: 'done', intent.id: 88492373-6d74-4d92-9ae2-4aaa03a3ff4d }` at `2026-09-14T23:13:36Z`.

Idempotent re-call afterward: still `done`, nam count unchanged (prove-only; no duplicate rows).

## 17–18. Post-repair intent / join

Intent (exactly one):

| Field | Value |
| --- | --- |
| status | `done` |
| draft_id | `5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08` |
| provider | `stocknewsapi` |
| provider_article_id | `sna_url_3b57d128669634d12ddc6154` |

Join (exactly one): KEY ↔ expected article, `draft_id` set.

## 19. Duplicate / conflict verification

No duplicates. No conflicting article for KEY. Idempotent second upsert did not increase row counts.

## 20. `news_article_markets` count

```text
4 → 5  (+1)
```

## 21. Lore repository result

```text
LORE REPOSITORY QUERY: PASS
```

`getNewsArticleLoreForToken` returned expected title + investors.com URL.

## 22. Article market count result

`GET /api/news/sna_url_3b57d128669634d12ddc6154/markets` → `items` length 1 including KEY (`0x587ed3fd…`).

## 23. Live token page Lore

`https://scoop.fun/token/0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8`

- page loads, image visible, market data visible
- Lore heading present (`token-lore`)
- headline correct (`token-lore-headline`)
- source link → investors.com article (`token-lore-link`)

```text
KEY LORE REPAIRED: YES
```

## 24. Exact future durability path

```text
pin-time display intent already stores draft_id
→ receipt display bind may match by image_uri/path even if client body draftId is absent
→ bind result returns trusted intent draftId
→ display-image bind route chooses body.draftId || result.draftId
→ server calls upsertNewsArticleMarketIntentAndLink
→ durable news intent exists before navigation can lose client state
→ join immediate if launch indexed, otherwise pending
→ cron recovery can finish later
```

## 25. Trusted intent draftId used when client omits it

```text
YES
```

Confirmed in live code at HEAD + route/bind tests. No remaining path requires client `draftId` when the bound display intent already has it.

## 26. Focused tests

| Suite | Result |
| --- | --- |
| `bind-token-display-image.test.ts` | 9 passed (incl. KEY draftId return) |
| `display-image/bind/route.test.ts` | 3 passed (result.draftId dual-write / prefer body / skip non-news) |
| `news-article-market-intents.test.ts` | 9 passed (link, invalid draft, mismatch, conflict, lore) |

## 27. Build / typecheck

- `@scoop/db` build: PASS
- `@scoop/web` typecheck: PASS
- `@scoop/web` build: PASS

## 28. Deploy result

Hardening already Production-success on `2b0a2fa` before repair. This task adds route tests + report; push for Vercel after commit (no Render).

## 29. Production verification

KEY Lore live on scoop.fun after DB repair. Hardening already serving from Production SHA containing `f72aa98`.

## 30. Remaining blocker(s)

None for this news-durability / KEY Lore closure.

## 31. Remaining important issue(s)

Vercel CLI local token is expired/invalid; Production status was verified via GitHub Deployments instead. Consider refreshing CLI auth for future ops (not a product blocker).

## 32. Unrelated rows

Confirmed: only KEY intent + one new `news_article_markets` row; nam `4→5`; no MUSE/2HAWK/T110/SWAT mutations; no token/image/indexer changes.

---

## KEY Lore closure answer

> **VERDICT:** PASS — KEY REPAIRED AND POST-FIX NEWS DURABILITY BLOCKER CLOSED

> **TOKEN:** `0x587ed3fd3fcac06a8801690e7cc8c9cc2e7559c8`

> **KEY LORE REPAIRED:** YES

> **NEWS INTENT EXISTS:** YES

> **NEWS INTENT STATUS:** done

> **DURABLE NEWS LINK EXISTS:** YES

> **LORE REPOSITORY QUERY:** PASS

> **LIVE TOKEN PAGE SHOWS LORE:** YES

> **HARDENING LIVE ON VERCEL:** YES

> **TRUSTED INTENT DRAFTID USED WHEN CLIENT OMITS IT:** YES

> **FOCUSED TESTS:** PASS

> **WEB BUILD:** PASS

> **POST-FIX NEWS DURABILITY BLOCKER CLOSED:** YES

> **LAUNCH BLOCKER REMAINS:** NO

> **NEXT STEP:** Stop and return this report for review before final GO/NO-GO.
