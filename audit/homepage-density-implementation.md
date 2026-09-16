# Homepage density implementation

## 1. Verdict

**PASS — HOMEPAGE DENSITY PASS IMPLEMENTED**

## 2. UTC timestamp

`2026-09-16T07:51:01Z`

## 3. Branch / pre-HEAD / final HEAD

| Item | Value |
|------|--------|
| Branch | `main` |
| Pre-HEAD (before this work) | `99ccc23f6bd8bd790eeab62cf25be57752621109` (approved `/news` density, local) |
| Final HEAD | see §16 / `git log -1 --format=%H` |

Combined commit soft-replaces the local `/news`-only commit so news + homepage density land together.

## 4. Exact homepage files changed

- `apps/web/src/components/home/NowSection.tsx`
- `apps/web/src/components/home/LiveDeskStrip.tsx` (margin only)
- `apps/web/src/components/home/PlatformBadge.tsx`
- `apps/web/src/components/home/HomepageInfrastructureBadges.tsx`
- `apps/web/src/components/home/HouseLeadHero.tsx`
- `apps/web/src/components/home/DiscoverSection.tsx`
- `apps/web/src/components/home/HomepageInfrastructureBadges.test.tsx`
- `apps/web/src/components/home/HouseLeadHero.test.tsx`
- `audit/homepage-density-implementation.md` (this report)

## 5. NowSection changes

| | Old | New |
|--|-----|-----|
| Shell | `pt-4 … md:pt-5 md:pb-3` | `pt-3 … md:pt-4 md:pb-2.5` |
| Hero row | `mb-3 gap-4 md:mb-4 md:gap-8` | `mb-2.5 gap-3 md:mb-3 md:gap-6` |
| Brand/badges | `gap-3 lg:gap-4` | `gap-2.5 lg:gap-3.5` |
| Tagline | `mt-3` | `mt-2.5` |
| Mobile Launch | `mt-5` | `mt-4` (CTA size unchanged) |
| Divider | `mb-5 md:mb-6` | `mb-3.5 md:mb-4` |

## 6. Infrastructure badge changes

| | Old | New |
|--|-----|-----|
| Badge height | `h-11` / `sm:h-[52px]` | `h-9` / `sm:h-11` |
| Badge pad | `px-2` / `sm:px-3` | `px-1.5` / `sm:px-2.5` |
| Icons | `h-6 w-6` / `sm:h-8` | `h-5 w-5` / `sm:h-7` |
| Row gap | `gap-1.5 sm:gap-2.5` | `gap-1 sm:gap-2` |

Copy, borders, three-card row preserved.

## 7. Mobile lead-story changes

- Padding: `p-4 pb-5 space-y-3` → `p-3.5 pb-4 space-y-2.5`
- Meta/headline gaps slightly tightened; type sizes preserved
- Actions: always `flex-row` (wrap only if needed); no `flex-col`
- Launch Assist + Read Story links unchanged; local `className` only; shared primary/CtaLink defaults untouched
- Tap targets remain `min-h-11`

## 8. Desktop lead-story changes

Modest pad cut: `md:p-6` → `md:p-5`, `lg:p-7` → `lg:p-6`; `md:space-y-4` → `md:space-y-3.5`. Lead remains editorial hero.

## 9. Discovery-section changes

| | Old | New |
|--|-----|-----|
| Section top | `pt-3 md:pt-4` | `pt-2.5 md:pt-3` |
| Tablist | `mb-8` | `mb-4 md:mb-5` |
| Grid | `gap-y-6` | `gap-y-5` |

Tabs/polling/ranking/cards unchanged.

## 10. Market-tape confirmation

Ticker overflow CSS (`.live-desk-strip`, `.desk-pill*`) **not modified**. Only `LiveDeskStrip` wrapper margin: `mb-3 md:mb-4` → `mb-2.5 md:mb-3`. Data/refresh unchanged.

## 11. Functional behavior preservation

```text
main launch → /launch — unchanged
lead rotation/fade — unchanged
Launch Assist handoff — unchanged
Read Story external — unchanged
discovery tabs — unchanged
discovery polling/ranking — unchanged
market navigation — unchanged
```

## 12. Tests/typecheck/diff checks

```bash
pnpm --filter @scoop/web exec vitest run \
  src/components/home/NowSection.test.tsx \
  src/components/home/HouseLeadHero.test.tsx \
  src/components/home/DiscoverSection.test.tsx \
  src/components/home/TokenDiscoveryItem.test.tsx \
  src/components/home/HomepageInfrastructureBadges.test.tsx \
  src/components/home/LiveDeskStrip.test.tsx \
  src/components/launch-assist/LaunchAsTokenLink.test.tsx
# 7 files, 64 passed

pnpm --filter @scoop/web run typecheck  # ok
git diff --check                        # clean on home paths
```

## 13. Responsive verification

**Not performed in a browser.** Alex visual review required at ~320 / 390 / 768 / 1440px.

## 14. Architecture impact

```text
API/data: NONE
polling: NONE
news ingestion: NONE
Launch Assist logic: NONE
discovery logic: NONE
DB/schema: NONE
indexer/workers: NONE
protocol: NONE
global ticker CSS: NONE
homepage presentation: CHANGED
```

## 15. Combined commit contents

| File | Classification |
|------|----------------|
| `apps/web/src/app/news/page.tsx` | approved `/news` density |
| `apps/web/src/components/news/NewsFeed.tsx` | approved `/news` density |
| `apps/web/src/components/news/NewsCategoryBrowse.tsx` | approved `/news` density |
| `audit/news-layout-density-implementation.md` | `/news` implementation report |
| Homepage files in §4 | homepage density |
| `audit/homepage-density-implementation.md` | homepage implementation report |

Unrelated audits / P10.4 / `gate-min.test.tsx` / `/markets` **not** staged.

## 16. Commit SHA/message

```text
style(ui): tighten news and homepage density
```

SHA: `git log -1 --format=%H` after commit.

## 17. Push/deploy

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 18. Remaining visual follow-ups

- Confirm one-row lead CTAs at 320px with long “Launch another market” copy
- Confirm badge truncation on very narrow phones still readable

## 19. Final gate

```text
NEWS + HOMEPAGE DENSITY COMPLETE — SAFE FOR ALEX FINAL VISUAL REVIEW BEFORE PUSH
```
