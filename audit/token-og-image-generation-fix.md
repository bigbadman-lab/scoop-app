# Token OG Image Generation Fix

## 1. Verdict

## `PASS — TOKEN OG IMAGE GENERATION FIXED`

Live MUSE `opengraph-image` previously returned **HTTP 500 / empty body**. After deploy, the endpoint returns **HTTP 200** with `Content-Type: image/png` and valid PNG bytes. Metadata continues to point at the file-based OG route. MUSE DB/token data was not mutated; no new token launched.

---

## 2. Pre-HEAD

`8d510aa9e940603b6e5af0d81545aebfdc43767e`  
(`docs(audit): record headless SIWE deploy Ready`)

Working tree already had WIP OG changes (template tracing, SVG reject, graceful degrade) that were completed and shipped in this task.

---

## 3. Final HEAD

`99fda4ebc83e4284f1baf950e09d3b9589579d88`  
(`fix(web): repair token OG image generation`)

---

## 4. git status before / after

**Before:** modified `opengraph-image.tsx`, `og-safe-image.ts(+test)`, `next.config.ts`; untracked `og-template.ts(+test)`; unrelated audit/P10.4 noise.

**After:** OG fix committed/pushed; unrelated untracked reports remain.

---

## 5. Exact live MUSE metadata before fix

| Field | Value |
|-------|--------|
| `og:title` | Muse Mode (MUSE) |
| `og:description` | Muse Mode (MUSE) market on SCOOP / Robinhood Chain · quoted in META · … |
| `og:image` | `https://scoop.fun/token/0x7c6b5347fa848121a8308dd12daca05171f5cbc5/opengraph-image` |
| `og:image:type` | *(absent)* |
| `og:image:width` / `height` | *(absent)* |
| `twitter:card` | `summary_large_image` |
| `twitter:image` | same opengraph-image URL |

Page HTTP: **200**. Deploy id observed in HTML: `dpl_BkTYuXJNXgrNmCnkBzBV8wv6vUYL`.

---

## 6. Exact `og:image` URL before fix

`https://scoop.fun/token/0x7c6b5347fa848121a8308dd12daca05171f5cbc5/opengraph-image`

---

## 7. Exact failing response before fix

| Item | Value |
|------|--------|
| Status | **500** |
| Body | empty (`content-length: 0`) |
| Content-Type | *(none)* |
| `x-matched-path` | `/token/[address]/opengraph-image` |
| Cache | `MISS` / `public, max-age=0, must-revalidate` |
| UA | reproduced with `facebookexternalhit/1.1`, `Twitterbot/1.0`, Slackbot |

---

## 8. Where SVG entered the flow

- **Not** as the `og:image` itself (route exports `contentType = 'image/png'` via `ImageResponse`).
- Brand folder contains optional SVGs (`rh.svg`, `uni.svg`) **not** used by the token OG card.
- Token logos *can* be SVG on IPFS/Supabase; production HEAD could embed mislabeled SVG bytes into Satori and crash.
- External checkers labeling the failure as `svg` most likely mis-classified the **failed fetch** (empty 500), not a raw SVG `og:image`.

Defense added: reject SVG by Content-Type **and** byte sniff (`isSvgImageBytes`) → monogram fallback.

---

## 9. Actual root cause

Primary production failure:

```text
opengraph-image → readFile(public/brand/token-template.png)
→ file not included in Vercel serverless NFT bundle
→ rejected promise / uncaught throw
→ HTTP 500 empty body
```

Contributing reliability gaps (fixed together):

1. No try/catch / degrade when template missing  
2. `notFound()` on invalid/not_found OG lookups (harsh for crawlers)  
3. Logo size cap **1.5MB** — MUSE display PNG is **~1.69MB** (would force monogram even after template fix)  
4. SVG embed risk for ImageResponse/Satori  

Historical MUSE display-image outage is **orthogonal**: live MUSE already had a healthy Supabase `display_image_url` PNG at audit time.

---

## 10. Related to historical MUSE display-image failure?

**No.** Display image was already repaired / finalized. OG failed independently because the **serverless OG route** could not load the background template (and lacked resilient fallbacks).

---

## 11. Token image source selection before

`buildTokenOgCardModel` → `pickTokenImageSrc(displayImageUrl, imageUri)`  
(prefer `display_image_url`, else IPFS/HTTPS `image_uri`) → `loadOgLogoDataUri` allowlist fetch.

---

## 12. Token image source selection after

**Unchanged selection order.** Safer load: SVG rejected; byte limit **2.5MB**; fetch timeout **4s**.

---

## 13. Template / runtime changes

| Change | Purpose |
|--------|---------|
| `loadTokenOgTemplateDataUri` | FS multi-path + HTTPS `/brand/token-template.png` fallback |
| `outputFileTracingIncludes` for opengraph-image | Bundle `token-template.png` into serverless |
| `TemplateLayer` null → gradient | Render without template file |
| Outer try/catch | Never 500 when optional assets fail |
| Unavailable card for non-ok token loads | Valid PNG instead of `notFound()` |

---

## 14. Fallback behavior

```text
valid display/IPFS raster → embed logo
SVG / fetch fail / oversize → monogram
template missing → gradient background
token lookup fail → UnavailableCard PNG
unexpected throw → UnavailableCard (best effort)
```

---

## 15. Metadata changes

Token `generateMetadata` now passes `ogImageWidth` / `ogImageHeight` (1200×630) for the custom OG route. Still a single absolute `og:image` / `twitter:image` pointing at `/token/.../opengraph-image`.

---

## 16. Tests added / extended

- `og-safe-image.test.ts` — SVG CT/bytes reject; MUSE-sized PNG under new limit  
- `og-template.test.ts` — local load + HTTPS fallback when FS misses  
- `site.test.ts` — token OG dimensions  

---

## 17. Regression tests

`og-card`, `og-safe-image`, `og-template`, `site` — **46 passed**.

---

## 18. Typecheck

`tsc --noEmit` — **PASS**

---

## 19. Build

`pnpm run build` (`apps/web`) — **PASS**

---

## 20–22. Commit / push / deploy

| Item | Value |
|------|--------|
| Commit | `99fda4ebc83e4284f1baf950e09d3b9589579d88` |
| Message | `fix(web): repair token OG image generation` |
| Push | `origin/main` |
| Vercel project | `cope2/scoop-web` |
| Deployment | `6Jqhh2PTPGiFTbKXpinUtByxTBfq` (**Ready**) |
| Dashboard | https://vercel.com/cope2/scoop-web/6Jqhh2PTPGiFTbKXpinUtByxTBfq |
| Production HTML dpl | `dpl_6Jqhh2PTPGiFTbKXpinUtByxTBfq` |

---

## 23–26. Live MUSE verification (post-deploy)

| Check | Result |
|-------|--------|
| Page 200 | **PASS** |
| `og:image` URL | `https://scoop.fun/token/0x7c6b5347…cbc5/opengraph-image` |
| `og:image:width` / `height` | **1200 / 630** |
| OG endpoint status | **200** (3 consecutive crawler-UA fetches) |
| Content-Type | **`image/png`** |
| Bytes | PNG 1200×630 RGBA, ~257KB |
| Card contains MUSE art | **YES** — MUSE MODE display artwork rendered in logo badge with `$MUSE` / Muse Mode / META / contract / SCOOP |
| Cache headers | `public, immutable, … max-age=31536000` |

---

## 27. External checker

Direct crawler UA proof used as primary (facebookexternalhit). No separate third-party checker run required after three consecutive production PNG 200s.

---

## 28–29. Confirmations

- **MUSE DB/token data not mutated**
- **No new token launched**

---

## 30. Residual risks

- Very large logos still degrade to monogram above 2.5MB  
- HTTPS template fallback depends on `absoluteSeoUrl` / public CDN  
- IPFS gateway latency can force monogram (still 200 PNG)  

---

## 31. Launch-ready?

**Yes for OG generation** once live MUSE PNG 200 is confirmed below.

---

> **Token pages now generate a valid custom SCOOP OG image in production using the canonical token image pipeline, including MUSE, without returning an Internal Server Error to social crawlers.**
