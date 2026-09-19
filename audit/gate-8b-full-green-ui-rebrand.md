# Gate 8B — Full SCOOP Orange → Green UI Rebrand

## 1. Verdict

`PASS — SCOOP ORANGE BRANDING RETIRED; GREEN UI DEPLOYED`

`$TAPE` was not removed. No canary was broadcast.

## 2. UTC timestamp

Report written `2026-09-19T20:01:17Z`. Vercel production success `2026-09-19T19:59:39Z`.

## 3. Git/deploy state

| Field | Value |
|---|---|
| Pre-HEAD | `7d68369bf09ba30eaa62372b6642fb677574b764` |
| Final HEAD | `bf023245fdfb3ad48fe6bcf193695a15e8e531f1` |
| Commit | `bf023245fdfb3ad48fe6bcf193695a15e8e531f1` `style: migrate SCOOP branding from orange to green` |
| Push | `7d68369..bf02324` to `origin/main` |
| Vercel | success, `https://vercel.com/cope2/scoop-web/NU5uTAAhWCP6wo6gUGTTDDPokAW1` |
| Indexer | auto-deploy `dep-daneiiu8bjmc73agtqk0` canceled while building. Live indexer unchanged |

56 files in the commit. Unrelated dirty work and `apps/web/src/components/token/gate-min.test.tsx` were left out. This report is not in the commit.

## 4. Canonical colour

```text
#015225
```

Source of truth:

- CSS `--scoop-green: #015225`
- CSS `--scoop-green-contrast: #f5f3ef` (paper, so type stays readable on the dark green fill)
- CSS `--color-scoop: var(--scoop-green)`
- TypeScript `SCOOP_GREEN` / `SCOOP_GREEN_CONTRAST` in `apps/web/src/lib/brand.ts`

`--scoop-orange` and `SCOOP_ORANGE` are gone. Near-black text on `#015225` would fail contrast, so fills use the paper contrast colour instead of the old near-black.

## 5. Logo/avatar usage

`/brand/logogreen.png` via `SCOOP_MARK_SRC`:

- site mark (header, sidebar, footer)
- favicon and apple icon (unchanged from Gate 8A)
- signed-out sidebar / mobile SCOOP avatar (`SCOOP_AVATAR_SRC` now equals `SCOOP_MARK_SRC`)

Authenticated profile avatars still come from the user profile. They were not replaced with the logo. Initials fallbacks keep the user monogram and only change the brand fill to green.

## 6. Homepage cleanup

The bottom economics block (`ProtocolSection`, “The market feeds the market.”) was a full orange field. It is now `#015225` with paper text. Launch and Launch Market CTAs use the same green. Active discover tab underline is green. Screenshot: `audit/gate-8b-screenshots/home-1440.png`.

## 7. Global component cleanup

Migrated through the token rename, not one-off colours:

- primary CTAs (`CtaLink`, launch continue, news launch, auth, account)
- sidebar and mobile-nav active states, including the Create button
- launch progress, step rails, drag-over borders
- market leader accent and ranking underlines
- news category selected outline
- copy-address active text
- support callout, docs blockquote, about/docs/tape glows
- image fallbacks and quote-asset monogram
- desk live-dot pulse

The dev-buy validation message was brand orange used as an error. It is now `text-red-600`, matching other alerts, not green.

## 8. Wallet/meta/OG cleanup

- AppKit `--w3m-accent` is `SCOOP_GREEN`
- viewport `themeColor` is `SCOOP_GREEN` (`#015225` on production)
- no PWA manifest existed
- token OG accent text uses `SCOOP_GREEN_CONTRAST` so it stays readable on the green field
- monogram badge fill is `SCOOP_GREEN`
- `public/brand/token-template2.png` was a flat orange field; it is now a flat `#015225` field of the same size. Layout is unchanged
- AppKit metadata icon data URI was rebuilt from `logogreen.png`

## 9. Residual orange audit

Live application source matches for `#FC4C00`, `#fc4c00`, `--scoop-orange`, and `SCOOP_ORANGE`:

```text
0 unintended legacy orange brand references
```

Remaining mentions, all intentional:

| Location | Why it remains |
|---|---|
| `apps/web/src/lib/brand-lock.test.ts` | the regression test lists the forbidden tokens |
| `apps/web/src/lib/media/og-safe-image.test.ts` | allowlist example URL `https://scoop.fun/brand/MARK.png`, not a rendered mark |
| `public/brand/MARK.png`, `SCOOPAV.png`, `appkit-icon.png` | historical files, no longer referenced by the live UI |
| `--scoop-live` / up-down colours | semantic market colour, not brand orange |
| token and news artwork | content images, including the existing `$TAPE` picture; not recoloured |

## 10. Responsive verification

Local production build (`next start` on port 3010), Chrome headless:

| Viewport | File | Result |
|---|---|---|
| 1440 desktop | `audit/gate-8b-screenshots/home-1440.png` | green logo, green Launch CTA, green economics section, green sidebar Create |
| 1024 | `audit/gate-8b-screenshots/home-1024.png` | same green system |
| 390 mobile | `audit/gate-8b-screenshots/home-390.png` | green Launch, green active tab, green bottom-nav Create, green header mark |
| 1440 | `launch-1440.png`, `markets-1440.png`, `news-1440.png`, `token-1440.png` | launch continue and progress green; markets active rail green; pages load |

Warm pixels in news/token artwork are content, not chrome. No browser tab was left open against production; production HTML was checked after deploy.

## 11. Tests/build

- brand lock, discover tabs, wallet slot, launch CTA, protocol section, AppKit metadata tests passed
- `pnpm --filter @scoop/web build` passed in an isolated dist directory so it did not fight the running dev server

## 12. Production smoke

| Check | Result |
|---|---|
| `https://scoop.fun` | 200, theme-color `#015225`, `logogreen.png`, no `MARK.png` / `SCOOPAV` / `#FC4C00` |
| `/launch` | 200 |
| `/markets` | 200 |
| `/news` | 200 |
| token `0x5d7493…` | 200, `Scoop (TAPE) · SCOOP` |
| `/api/launch/pons-schema-ready` | `{"ready":true,"reason":null,"hasMarketSource":true,"hasCurveAddress":true}` |

## 13. Explicit protocol safety

- DB migration: NO
- indexer config change: NO
- workers resumed: NO
- Pons code changed: NO
- HoodLock logic changed: NO
- Pons launch broadcast: NO
- HoodLock approval: NO
- HoodLock lock: NO

Fee-keeper, holder-rewards, news-ingest, and `cloud-index-pons-fees` remain suspended. `scoop-app` stayed on the previous indexer deploy.

## 14. Next step

The next step remains:

**Gate 8 production Pons + HoodLock canary execution.**

`$TAPE` de-surfacing remains a separate cleanup step after the canary unless explicitly requested sooner.
