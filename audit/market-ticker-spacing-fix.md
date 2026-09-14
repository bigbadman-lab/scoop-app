# Homepage market ticker spacing fix

## 1. Pre-HEAD

`bf5174d87836134512b525316b6c13cd50eebb58`  
Branch: `main`

## 2. Exact component/file changed

- Styles: `apps/web/src/app/globals.css` (`.desk-pill*` rules)
- Component (unchanged structure): `apps/web/src/components/home/LiveDeskStrip.tsx`

## 3. Previous spacing values/classes

| Rule | Before |
|------|--------|
| `.desk-pill` gap | `0.45rem` |
| `.desk-pill` padding | `0.4rem 0.75rem` |
| `.desk-pill-price` | `min-width: 4.75rem; text-align: right` |
| `.desk-pill-live .desk-pill-price` | `min-width: 5.5rem; text-align: left` |
| `.desk-pill-change` | `min-width: 3.75rem; justify-content: flex-end; gap: 0.2rem` |

Fixed min-widths on price/change were the main cause of stretched internal whitespace.

## 4. New spacing values/classes

| Rule | After |
|------|--------|
| `.desk-pill` gap | `0.875rem` (~14px) |
| `.desk-pill` padding | `0.4rem 0.7rem` (~11px horizontal) |
| `.desk-pill` | `width: max-content` (content-width pills) |
| `.desk-pill-price` | no min-width / no forced right align |
| `.desk-pill-live .desk-pill-price` | `text-align: left` only |
| `.desk-pill-change` | no min-width / no justify-end; `gap: 0.1rem` |

Height, typography sizes/weights, colors, radius, and strip behavior unchanged.

## 5. Width / min-width / justify behavior

- Removed price and change `min-width`s
- Removed change `justify-content: flex-end`
- Added `width: max-content` so pills size to content
- No equal-width pills

## 6. Desktop verification

Intrinsic-width pills; ETH/BTC/S&P 500/FTSE 100 stay single-line with tighter symbol–price–move grouping. Strip still horizontal-scrolls if needed.

## 7. Mobile verification

Same CSS; `white-space: nowrap` + strip `overflow-x: auto` preserved — no wrap/clip from this change.

## 8. Tests/build result

- `LiveDeskStrip.test.tsx`: pass (5)
- `@scoop/web` build: pass

## 9. Commit

`5e763fa` — `fix(web): tighten market ticker spacing`

## 10. Push

Pushed to `origin/main` (`bf5174d..5e763fa`).

## 11. Vercel deployment result

Production Ready: `dpl_Bwm7uAPaQ3z18JvJJGXDCaYRx3wT`  
`https://scoop-g2wk154fo-cope2.vercel.app` → `https://scoop.fun`

## 12. Final HEAD

`5e763faaa5bfe3d10fad95305074ee1aec6d33d7`

## 13. `git status --short`

Feature clean; unrelated untracked audit/P10.4 reports remain.

---

**Homepage market ticker spacing has been tightened without changing the ticker’s height, typography, colors, data, or behavior.**
