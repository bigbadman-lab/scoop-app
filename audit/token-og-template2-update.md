# SCOOP — Token OG Template2 Update

## 1. Verdict

```text
PASS — TOKEN OG GENERATION SWITCHED TO TOKEN-TEMPLATE2
```

## 2. UTC timestamp

```text
2026-09-15T17:22:30Z
```

## 3. Branch / pre-HEAD / final HEAD

```text
branch:   main
pre-HEAD: 08eade7ae51842b9c2c48167cf7f544442a4b3df
final:    8872ae1647a18823792dedc39cdf7d7c66533d77
```

## 4. New asset verification

| Check | Result |
| --- | --- |
| Path | `apps/web/public/brand/token-template2.png` |
| `file` | PNG image data, 1200 × 630, 8-bit/color RGB, non-interlaced |
| Generator size | Matches `TOKEN_OG_SIZE` `{ width: 1200, height: 630 }` in `og-card.ts` |
| PNG magic | Loader requires `0x89 0x50` — satisfied |
| Compatibility | Compatible; no generator redesign required |

Note: new asset is smaller on disk (~5 KB vs prior ~125 KB) but same canvas dimensions/type.

## 5. Canonical OG generation path

```text
/token/[address]/opengraph-image
  → loadTokenOgTemplateDataUri()  (apps/web/src/lib/token/og-template.ts)
  → FS: public/brand/token-template2.png (or apps/web/… monorepo cwd)
  → else HTTPS fetch absoluteSeoUrl('/brand/token-template2.png')
  → ImageResponse composition (name/ticker/artwork) unchanged
```

NFT tracing: `apps/web/next.config.ts` `outputFileTracingIncludes` for `/token/[address]/opengraph-image`.

## 6. Exact old → new implementation

| Location | Change |
| --- | --- |
| `TOKEN_OG_TEMPLATE_PUBLIC_PATH` | `/brand/token-template.png` → `/brand/token-template2.png` |
| FS candidate paths | `…/token-template.png` → `…/token-template2.png` |
| `next.config.ts` tracing include | `./public/brand/token-template2.png` |
| Tests | Expect new public path |
| Assets | Add `token-template2.png`; delete tracked `token-template.png` |

## 7. Old-reference search and classification

Post-switch search for `token-template.png`:

| Match | Class |
| --- | --- |
| `audit/token-og-image-generation-fix.md` (historical) | Docs only — left unchanged per brief |
| Live runtime / config / tests | **none** |

```text
live runtime references to token-template.png: 0
```

Live runtime references to `token-template2.png`: constant, FS paths, Next tracing include, tests.

## 8. Behavioral scope

Only template selection changed. Unchanged:

- Token OG route `/token/[address]/opengraph-image`
- Name/ticker/artwork composition (`og-card` / opengraph-image)
- Metadata path helpers (`tokenOpenGraphImagePath`)
- Output size 1200×630 / PNG content type
- Memoized template load + HTTPS fallback behavior
- Persistence/storage of token images (unrelated)
- Token page UI

## 9. Existing / cached OG behavior

- Previously generated/cached OG responses (CDN, browser, crawler caches) remain until they expire or are re-fetched.
- New template takes effect on the next generation of `/token/[address]/opengraph-image` after this deploy (serverless cold/warm load of the new traced asset).
- No production cache purge and no historical OG regeneration performed.

## 10. Exact tests / typecheck / results

```text
vitest: og-template.test.ts + og-card.test.ts
  Test Files  2 passed (2)
  Tests       15 passed (15)

pnpm --filter @scoop/web run typecheck → exit 0
git diff --check → clean
```

FS load test proves `token-template2.png` is readable as a PNG data URI.

## 11. Architecture impact

```text
protocol: NONE
database/schema: NONE
migration: NONE
indexer: NONE
environment/config: NONE
```

## 12. Exact files committed

```text
apps/web/public/brand/token-template2.png          (added)
apps/web/public/brand/token-template.png           (deleted)
apps/web/src/lib/token/og-template.ts
apps/web/src/lib/token/og-template.test.ts
apps/web/next.config.ts
audit/token-og-template2-update.md
```

## 13. Git hygiene / unrelated work preserved

Staged only §12. Unrelated dirty/untracked audits and P10.4 reports left untouched. No push/deploy.

## 14. Commit SHA / message

```text
8872ae1647a18823792dedc39cdf7d7c66533d77
fix(og): use new token template
```

## 15. Push / deploy

```text
push: NOT PERFORMED
deploy: NOT PERFORMED
```

## 16. Final gate

```text
TOKEN OG TEMPLATE UPDATE COMPLETE — SAFE FOR ALEX REVIEW BEFORE PUSH/DEPLOY
```
