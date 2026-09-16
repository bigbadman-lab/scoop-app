# Homepage protocol announcement update

## Verdict

Announcement bar copy and destination updated to protocol tape. Existing `/house/live.png` LIVE icon preserved. Local commit only — not pushed.

## UTC timestamp

`2026-09-16T08:35:13Z` (start) · commit after verification

## Pre-HEAD

`d5f506a051cca8e26d0940d362c6ae4a16b95ff6`

## Final HEAD / commit

`56978264ed4ebcb55ec4b1ed1b08c23ad91e6a00` — `feat(home): point announcement to protocol`

## Files changed

- `apps/web/src/lib/announcements.ts` — message + `href`
- `apps/web/src/components/home/AnnouncementBar.test.tsx` — expectations
- `audit/homepage-protocol-announcement-update.md` — this report

## LIVE PNG/WebP asset

**Unchanged.** Still `imageSrc: '/house/live.png'` (`apps/web/public/house/live.png`). No asset edit, replace, or redesign. `AnnouncementBar` still renders the same decorative `next/image`.

## Destination

| | |
|--|--|
| Old | `/news` |
| New | `/protocol/tape` (Next.js `Link`) |

## Final visible copy

`The SCOOP Protocol is live. Read more →`

(beside existing LIVE image; no duplicate text “LIVE” label)

## Tests / typecheck

- `vitest run` `AnnouncementBar.test.tsx` + `announcements.test.ts` — **7 passed**
- `tsc --noEmit` (apps/web) — **pass**

## Unrelated files

Not staged/committed. Dirty audits / P10.4 / other untracked work preserved.

## Push / deploy

**Not pushed. Not deployed.**

## Commit SHA

`56978264ed4ebcb55ec4b1ed1b08c23ad91e6a00`

---

`HOMEPAGE PROTOCOL ANNOUNCEMENT UPDATE COMPLETE`
