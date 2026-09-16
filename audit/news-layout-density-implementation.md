# `/news` density implementation

## 1. Verdict

**PASS — /NEWS DENSITY PASS IMPLEMENTED**

## 2. UTC timestamp

`2026-09-16T07:46:02Z`

## 3. Branch / pre-HEAD / final HEAD

| Item | Value |
|------|--------|
| Branch | `main` |
| Pre-HEAD | `dc38cc9e24c26cabb82e7718b0d8952d4b37d73d` |
| Final HEAD | see §16 / `git log -1 --format=%H` |

## 4. Exact files changed

- `apps/web/src/app/news/page.tsx`
- `apps/web/src/components/news/NewsFeed.tsx`
- `apps/web/src/components/news/NewsCategoryBrowse.tsx`
- `audit/news-layout-density-implementation.md` (this report)

## 5. Page-shell changes

| | Old | New |
|--|-----|-----|
| Max width | `max-w-3xl` | `max-w-4xl` |
| Padding | `px-4 py-5 md:px-8 md:py-6 lg:px-10` | `px-4 py-3 md:px-8 md:py-4 lg:px-10` |

`/news`-local only. Headline `max-w-3xl` inside `StoryBody` kept for readable line length.

## 6. Category-area changes

| | Old | New |
|--|-----|-----|
| Grid | `mb-5 … gap-2 sm:gap-3` | `mb-3 … gap-2 sm:gap-2.5` |
| Aspect | `aspect-[16/9]` | unchanged |
| Artwork / selection | unchanged | unchanged |

Header: `mb-2` → `mb-1.5`; LIVE row gap `gap-1` → `gap-0.5`.

## 7. Lead-story changes

| | Old | New |
|--|-----|-----|
| Wrapper | `pb-6` | `pb-3.5` |
| Kicker | `mb-1.5` | `mb-1` |
| Rotation / fade / pause | unchanged | unchanged |
| Hierarchy / CTAs | unchanged | unchanged |

Lead still uses larger headline + kicker; not card-styled.

## 8. Ordinary-row changes

| | Old | New |
|--|-----|-----|
| Row pad | `pb-6 pt-5` | `py-3` |
| Meta gap | `mt-1.5` | `mt-1` |
| Actions gap | `mt-2` / `gap-y-1.5` | `mt-1.5` / `gap-y-1` |
| Clamps / metadata / CTAs | unchanged | unchanged |

Also: pending banner `mb-4` → `mb-3`; load-more `mt-6` → `mt-4`.

## 9. Mobile behavior

- Feed CTAs remain `min-h-7` (feed-local `LaunchAsTokenLink` / `CtaLink` overrides) — not shrunk further.
- AppShell bottom-nav clearance untouched.
- Category `16/9` artwork retained; only surrounding whitespace reduced.
- Headlines still `line-clamp-2` / lead `line-clamp-3`.

## 10. Desktop behavior

- Column ~17% wider (`3xl` → `4xl`).
- Ordinary rows substantially tighter via `py-3` (primary density win).
- Lead remains slightly more prominent than static rows.

## 11. Functional behavior preservation

Confirmed presentation-only — no logic edits:

```text
polling — unchanged
LIVE status — unchanged
category selection / URL sync — unchanged
lead rotation / pause / fade — unchanged
story ordering / pending new — unchanged
Launch Assist handoff — unchanged
Read Story external — unchanged
market status — unchanged
```

## 12. Tests / typecheck / diff checks

```bash
pnpm --filter @scoop/web exec vitest run \
  src/components/news/NewsFeed.test.tsx \
  src/components/news/NewsCategoryBrowse.test.tsx \
  src/components/launch-assist/LaunchAsTokenLink.test.tsx
# 3 files, 23 passed

pnpm --filter @scoop/web run typecheck   # ok
git diff --check                         # clean (implementation files)
```

Diff is spacing/class-only on the three expected sources.

## 13. Responsive verification

**Not performed in a browser.** Visual check still required at ~320 / 390 / 768 / 1440px before push.

## 14. Architecture impact

```text
API/data: NONE
news ingestion: NONE
Launch Assist logic: NONE
DB/schema: NONE
indexer/workers: NONE
protocol: NONE
global shared styles: NONE
/news presentation: CHANGED
```

## 15. Unrelated work preservation

Unrelated dirty audits, P10.4 reports, and `gate-min.test.tsx` left unstaged.

## 16. Commit SHA/message

```text
style(news): tighten market feed layout
```

SHA: `git log -1 --format=%H` after commit.

## 17. Push/deploy

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 18. Final gate

```text
/NEWS DENSITY PASS COMPLETE — SAFE FOR ALEX VISUAL REVIEW BEFORE PUSH
```
