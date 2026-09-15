# ZHANG Lore Durability Repair

## 1. Verdict

```text
PASS — ZHANG REPAIRED AND FUTURE NEWS LORE DURABILITY CLOSED
```

## 2. UTC timestamp

`2026-09-15T15:06:17Z`

## 3. Branch / pre-HEAD / final HEAD

```text
branch:   main
pre-HEAD: 7ec177d41f4a1213054d91ba01080aa01ef31976
final:    010cf748e300ca60caa8a74729ee1e033e3a0272
```

## 4. Pre-repair production state

Reconfirmed read-only before mutation:

| Check | Result |
| --- | --- |
| token ZHANG | PRESENT |
| draft `592a24ee-…` `source_type=news` | PRESENT |
| article `sna_url_389e568f77f48bd92009759a` | PRESENT (Reuters) |
| tdfi done + draft_id | PRESENT |
| `news_article_market_intents` | ABSENT (0) |
| `news_article_markets` | ABSENT (0) |
| Lore on page | ABSENT |

## 5. Root cause reconfirmation

Matches `audit/zhang-news-lore-forensic-trace.md`:

- Lore is join on `news_article_markets`, not About/description
- Draft/article/display intent retained news identity
- News intent/link never created
- Indexer `applyBoundDisplayImageOnTokenInsert` could mark display `done` without news dual-write
- Browser `activateNewsArticleMarket` was previously a sole durability dependency for that gap

## 6. Chosen architectural repair

Shared trusted helper:

```text
ensureNewsArticleMarketFromTrustedDraft(db, { chainId, tokenAddress, draftId })
```

in `packages/db/src/repos/news-article-market-intents.ts`

Resolves article only via `resolveArticleFromDraft` → `upsertNewsArticleMarketIntentAndLink`. Non-news drafts no-op.

Wired into every trusted display-completion path:

| Path | File / function | Behavior |
| --- | --- | --- |
| Indexer enrich | `applyBoundDisplayImageOnTokenInsert` | after mark `done`, ensure news from intent.draftId |
| Receipt bind | `bindAndFinalizeTokenDisplayImage` | ensure on all successful bind outcomes |
| Bind route dual-write | `display-image/bind/route.ts` | **kept** (idempotent redundancy) |
| Cron pending finalize | `reconcileTokenDisplayImages` | after success, ensure using **pin-time** `intent.draftId` (even when path nulls draftId into finalize) |
| Cron orphan finalize | same | ensure from openIntent/orphan draftId |
| ZHANG-class healer | `listDoneDisplayIntentsMissingNewsLink` + reconcile | heals done display + news draft + missing nami |

## 7. Trusted provenance proof

Repair used only:

```text
chainId=4663
tokenAddress=0x13c1662af355d9e37966563a8559fe0801a709bc
draftId=592a24ee-8763-4612-9560-56370995b39e
```

Derived: `stocknewsapi` / `sna_url_389e568f77f48bd92009759a` from draft. No client headline/URL injection.

## 8. Code changes

- `packages/db/src/repos/news-article-market-intents.ts` — helper + healer list
- `packages/db/src/index.ts` — exports
- `packages/db/src/repos/token-display-finalize-intents.ts` — indexer dual-write
- `apps/web/src/lib/launch/bind-token-display-image.ts` — bind dual-write
- `apps/web/src/lib/launch/reconcile-token-display-images.ts` — cron ensure + healer
- `scripts/repair-news-article-market.mjs` — guarded preview/`--confirm` repair tool
- `package.json` — `news:repair-article-market` script
- regression tests (see §9)

## 9. Regression tests added

- `ensureNewsArticleMarketFromTrustedDraft`: no-draft, non-news, news+lore (C1/C5/C6), idempotency (C3), conflict (C4)
- `applyBoundDisplayImageOnTokenInsert`: ZHANG-class news creates nami/nam (C1/C6); non-news no nami (C2)

Existing bind-route / complete-launch / reconcile suites still pass.

## 10. Exact test results

```text
pnpm --filter @scoop/db exec vitest run \
  src/repos/news-article-market-intents.test.ts \
  src/repos/token-display-finalize-intents.test.ts
→ 19 passed

pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/bind-token-display-image.test.ts \
  src/lib/launch/reconcile-token-display-images.test.ts \
  src/app/api/launch/display-image/bind/route.test.ts \
  src/lib/launch/complete-launch.test.ts
→ 25 passed

pnpm --filter @scoop/db run typecheck → pass
pnpm --filter @scoop/web run typecheck → pass
```

## 11. ZHANG dry-run preview

```text
chain id: 4663
token address: 0x13c1662af355d9e37966563a8559fe0801a709bc
draft id: 592a24ee-8763-4612-9560-56370995b39e
draft source_type: news
provider: stocknewsapi
provider_article_id: sna_url_389e568f77f48bd92009759a
existing intent count: 0
existing market-link count: 0
article existence: PRESENT
expected action: CREATE/UPSERT CANONICAL NEWS MARKET INTENT AND LINK

ZHANG REPAIR PREVIEW PASSED — PRODUCTION MUTATION NOT YET PERFORMED
```

## 12. ZHANG production repair action

Exactly one guarded confirm:

```text
pnpm news:repair-article-market -- \
  --chain-id 4663 \
  --token 0x13c1662af355d9e37966563a8559fe0801a709bc \
  --draft-id 592a24ee-8763-4612-9560-56370995b39e \
  --confirm
```

Result: `linked: true`, intent `done`, market-link count 1.

## 13. Post-write DB verification

| Field | Value |
| --- | --- |
| nami count | 1 |
| nami status | `done` |
| nami draft_id | `592a24ee-8763-4612-9560-56370995b39e` |
| nami article | `sna_url_389e568f77f48bd92009759a` |
| nam count | 1 |
| nam article | same |
| `getNewsArticleLoreForToken` | Legend Biotech taps Novartis veteran Zhang as CEO @ reuters.com |

## 14. Production UI verification

`https://scoop.fun/token/0x13c1662af355d9e37966563a8559fe0801a709bc`

- About unchanged (CEO-arrival copy PRESENT)
- Lore PRESENT (`data-testid="token-lore"`)
- Headline: Legend Biotech taps Novartis veteran Zhang as CEO
- Source link: reuters.com → canonical Reuters URL
- No duplicate Lore section
- Image/market unaffected

## 15. Healthy KEY/SWAT regression

- KEY page: `token-lore` markers PRESENT
- SWAT page: `token-lore` markers PRESENT

## 16. Future-launch invariant proof

```text
Can trusted successful news-origin display finalization end with intent/link absent? NO
```

Indexer, bind, and cron completion paths all call `ensureNewsArticleMarketFromTrustedDraft`. Healer closes residual done+missing-nami windows.

## 17. Client-failure durability proof

```text
If browser activation is skipped/fails, does trusted server/indexer finalization persist/recover Lore? YES
```

Indexer enrich and cron reconcile no longer depend on `activateNewsArticleMarket`.

## 18. Every display-finalization path reviewed

| Path | Marks display done? | News durability |
| --- | --- | --- |
| `POST /api/launch/display-image/bind` → `bindAndFinalizeTokenDisplayImage` | yes | ensure in bind + route dual-write |
| Indexer `applyBoundDisplayImageOnTokenInsert` | yes | ensure after mark done |
| Cron pending `finalizeTokenDisplayImage` | yes (via applyIntentResult) | ensure with pin-time draft_id |
| Cron orphan finalize | yes (display URL) | ensure from draft ids |
| `bindAwaitingDisplayFinalizeIntents` | no (only awaiting→pending) | N/A; later pending path ensures |
| Client `activateNewsArticleMarket` | N/A | kept as redundant fast path |
| Healer `listDoneDisplayIntentsMissingNewsLink` | N/A | recovers ZHANG-class leftovers |

No unguarded ZHANG-equivalent completion path remains.

## 19. Schema/migration impact

```text
schema/migration: NONE
```

## 20. Protocol/TGE tooling impact

```text
protocol/TGE tooling: NONE
```

## 21. Blast-radius closure

- Single-token repair for ZHANG only
- Idempotent upsert; conflicting links blocked
- KEY/SWAT lore still present
- Non-news drafts no-op

## 22. Git hygiene / exact committed files

Staged/committed only:

```text
apps/web/src/lib/launch/bind-token-display-image.ts
apps/web/src/lib/launch/reconcile-token-display-images.ts
package.json
packages/db/src/index.ts
packages/db/src/repos/news-article-market-intents.ts
packages/db/src/repos/news-article-market-intents.test.ts
packages/db/src/repos/token-display-finalize-intents.ts
packages/db/src/repos/token-display-finalize-intents.test.ts
scripts/repair-news-article-market.mjs
audit/zhang-lore-durability-repair.md
```

Unrelated dirty/untracked work preserved.

## 23. Commit SHA/message

```text
010cf748e300ca60caa8a74729ee1e033e3a0272
fix(news): make launch lore durable
```

Pre-HEAD: `7ec177d41f4a1213054d91ba01080aa01ef31976`

## 24. Push/deploy status

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

Code durability ships only after Alex review + push/deploy. ZHANG **data** repair is already live in production DB (page Lore verified).

## 25. Final gate

```text
ZHANG LORE DURABILITY CLOSED — SAFE FOR ALEX REVIEW BEFORE PUSH/DEPLOY
```
