# Protocol tape docs CTA

## Verdict

Added a bottom docs CTA on `/protocol/tape` linking to `/docs`. Existing protocol copy and stats unchanged. Local commit only — not pushed.

## UTC timestamp

`2026-09-16T08:52:03Z`

## Pre-HEAD

`d96106da64868d8886afde358ba3cef7a90ae199`

## Final HEAD / commit SHA

(filled after commit)

## Files changed

- `apps/web/src/app/protocol/tape/page.tsx` — docs CTA section + `Link` import
- `audit/protocol-tape-docs-cta.md` — this report

## Exact CTA placement

After the existing “Built for market culture” section, still inside the page content container, before `</main>` / footer.

## Exact copy

| Element | Text |
|---------|------|
| Heading | `Want the full picture?` |
| Supporting | `Read the complete SCOOP documentation — protocol mechanics, launches, fees, rewards and more.` |
| CTA | `Read the docs →` |

## Destination

`/docs` via Next.js `Link`

## Tests / typecheck

- No existing page-level test for `/protocol/tape` content (only stats/tape helpers) — none updated
- `tsc --noEmit` (apps/web) — **pass**

## Existing protocol content

**Not rewritten.** Hero, stats shell, and “Built for market culture” body left intact; CTA appended only.

## Unrelated files

Not staged/committed. Dirty audits / other untracked work preserved.

## Push / deploy

**Not pushed. Not deployed.**

---

`PROTOCOL TAPE DOCS CTA COMPLETE`
