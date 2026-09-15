# SCOOP — Launch Assist Website Prefill Implementation

## 1. Verdict

```text
PASS — LAUNCH ASSIST WEBSITE PREFILL IMPLEMENTED
```

## 2. UTC timestamp

```text
2026-09-15T17:39:31Z
```

## 3. Branch / pre-HEAD / final HEAD

```text
branch:   main
pre-HEAD: 98825742372bc0381849638643adaed16f468474
final:    3199a3d518d1d8ef33157fcf72ea584e953c3e86
```

## 4. Exact files changed

```text
apps/web/src/lib/launch/validation.ts
apps/web/src/lib/launch/validation.test.ts
apps/web/src/components/launch/LaunchFlowLive.tsx
apps/web/src/components/launch/LaunchFlow.test.tsx
audit/launch-assist-website-prefill-implementation.md
```

## 5. Implementation

```text
LaunchAssistArticle.url
→ AssistedLaunchHandoff.article.url
→ applyAssistedPrefill
→ compatibleAssistWebsite(handoff.article.url)
→ LaunchFormState.website
→ existing validateTokenStep / buildLaunchParams
```

`applyAssistedPrefill` now includes:

```ts
website: compatibleAssistWebsite(handoff.article.url),
```

No TokenStep special-casing. Manual `/launch` never enters this path.

## 6. Compatibility filter

`compatibleAssistWebsite` in `validation.ts`:

| Input | Output |
| --- | --- |
| `https://…` and ≤256 | trimmed URL |
| missing/empty | `''` |
| `http://…` | `''` |
| bare domain | `''` |
| `javascript:` / `data:` / other non-https | `''` |
| >256 chars | `''` |

No HTTPS auto-prepend. Website form validation unchanged.

## 7. Manual launch proof

`LaunchFlow.test.tsx`: handoff present without `?assist=1` → Name and Website remain `''`.

## 8. Assist launch proof

With `?assist=1` and `url: 'https://reuters.com/a'` → Website input = that URL.
With `http://reuters.com/a` → Website stays `''` while name/provenance IDs still prefill.

## 9. User edit / clear proof

Pending-artwork Assist test: after prefill, user edits Website; artwork ready merge (image-only) leaves edited URL; user then clears Website → remains empty. Assist PATCH is once (`applied.current`).

## 10. Lore isolation proof

No edits to:

```text
sourceProvider / sourceProviderArticleId / sourceDraftId wiring
activateNewsArticleMarket
ensureNewsArticleMarketFromTrustedDraft
news_article_markets
complete-launch provenance gating
```

Assist prefill still sets the same provenance IDs; Website is an additional optional social field only. Tests still assert `data-source-article-id` / `data-source-draft-id`.

## 11. Existing behavior regression proof

Unchanged prefill of name/ticker/description/quote/image; existing LaunchFlow Assist cases still pass (10 tests in LaunchFlow.test.tsx).

## 12. Architecture impact

```text
protocol: NONE
database/schema: NONE
migration: NONE
indexer: NONE
API: NONE
IPFS/Pinata: NONE
environment/config: NONE
```

## 13. Tests / results

```text
pnpm exec vitest run src/lib/launch/validation.test.ts src/components/launch/LaunchFlow.test.tsx
  Test Files  2 passed (2)
  Tests       33 passed (33)
```

## 14. Typecheck / diff results

```text
pnpm --filter @scoop/web run typecheck → exit 0
git diff --check → clean
```

## 15. Exact committed files

Same as §4.

## 16. Unrelated work preservation

Unrelated dirty/untracked audits and P10.4 reports left untouched. No Lore durability files in the diff.

## 17. Commit SHA / message

```text
feat(launch-assist): prefill website from article
```

3199a3d518d1d8ef33157fcf72ea584e953c3e86

## 18. Push / deploy status

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 19. Final gate

```text
LAUNCH ASSIST WEBSITE PREFILL COMPLETE — SAFE FOR ALEX REVIEW BEFORE PUSH/DEPLOY
```
