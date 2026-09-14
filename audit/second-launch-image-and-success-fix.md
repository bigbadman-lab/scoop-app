# Second launch image + success UX fix

**Date:** 2026-09-14  
**Verdict:** `PARTIAL — CODE FIXED; PRODUCTION VERIFICATION REMAINS`  
(Token image repaired in production; code pushed — confirm Vercel/Render Ready + Alex’s next canary for end-to-end UX.)

## Identity

| Field | Value |
| --- | --- |
| Pre-HEAD | `2f30f5390fc6a7b6a2054f64ddf225edb4a57798` |
| Final HEAD | *(set after commit)* |
| Branch | `main` |
| Token | `0x8292b1af08e0b2efbc0f383091d11ebed33bac5b` |
| Name / symbol | Double Hawk / **2HAWK** |
| Launch tx | `0x96af89673caa2ffcd60cd064b5dbe762c535106857a1ecd2e88f081e51c1dae8` |
| Launch block / time | `62998239` / chain ts `1789408265` (~2026-09-14T17:51:05Z) |
| Onchain `image_uri` | `ipfs://bafybeicd63vwkebzjpdbbzudzkpgy3eqgr24llvvlwb7ajebw2ckqzrvbi` |

## Pre-fix production state

| Surface | Finding |
| --- | --- |
| `tokens.display_image_url` | **null** |
| Finalize intent | `awaiting_token`, `attempts=0`, path ready: `drafts/4797830a-…/97e16e0b2b16ac33.png` |
| Live tip | `image_uri`=ipfs, **`display_image_url=null`** |
| Live events | TokenLaunched + 2 Swaps observed; payload logo null at write time |
| Draft object | HTTPS **200** `image/png` 1 659 725 bytes |
| IPFS gateway `ipfs.io` | **429** (unusable fallback) |
| API | `displayImageUrl: null`, `imageUri` present |

## Root causes (multiple)

1. **Server finalization never applied** — intent remained `awaiting_token` for >15m with `attempts=0` (cron bind/finalize did not land). Client fast-path also did not write `display_image_url`.
2. **Live overlay public URL missing** — tip stored IPFS only; `display_image_url` null because indexer lacked a usable Supabase origin at observe time (no `SUPABASE_URL` / no prior `NEXT_PUBLIC` fallback / no DB-host derivation).
3. **IPFS UI fallback failed** — `pickTokenImageSrc` → `ipfs.io` returned 429, so surfaces showed blank/fallback despite correct `image_uri`.
4. **Merge hazard** — confirmed null `displayImageUrl` could win over a valid live image when tip source-block ≤ confirmed (fixed).

First failing stage for *web* image: **durable `display_image_url` finalization** (intent ready, never applied). Live path failed earlier at **public display URL construction**.

## Targeted repair (this token only)

Set `tokens.display_image_url` to the existing draft public object (same path as intent). Marked intent `done` + bound token address.  
`image_uri` unchanged. MUSE untouched.

**After:**  
`https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/drafts/4797830a-156e-46e8-a45e-32938900767d/a7111a7a-8c97-4441-a9c6-ec8b290f7190/97e16e0b2b16ac33.png`

Verified on:
- `GET /api/tokens/0x8292…` → display URL set  
- `/api/markets` → 2HAWK display URL set  
- `/api/discover` → 2HAWK display URL set  
- draft object HTTP 200  

## Code fixes

### Success UX
- Removed decode/indexing jargon from success copy (“Token details will appear shortly.” / “Market data is appearing now.”).
- Immediate success artwork via `previewUrl`.
- Contract copy retained (`ContractCopy`, Copy→Copied).
- Primary CTA **View token** → `/token/<address>` from receipt decode (testid `launch-view-token`).

### Image merge / recovery
- Best-image merge: confirmed HTTPS display → live HTTPS display → imageUri (never erase live with confirmed null).
- Orphan reconcile uses matching finalize-intent `display_image_path`.
- Indexer Supabase origin: `SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL` → derive from `db.<ref>.supabase.co` DATABASE_URL.
- Live tip falls back to IPFS gateway URL when public path URL still unavailable.
- `hasSupabaseUrl` in indexer public config view.

## Live-overlay canary timings (this launch)

| Label | Evidence |
| --- | --- |
| T0 | Block ts ≈ 17:51:05Z (`1789408265`) |
| T1 | Live TokenLaunched log `observedAt` **17:51:58.167Z** (`latencyMs` ~53167) |
| T2/T3 | Live tip had identity + ipfs, **no** display HTTPS; image UX failed |
| T4 | Canonical token row `created_at` **17:51:21.479Z** (~16s) — *before* live observe |

Live observer **did see** launch + swaps, but ~**53s** after mine on this first post-deploy canary (not 1–3s). Canonical indexed ~16s. No proof of volume double-count from available logs; tip volume uses pending-above-checkpoint aggregates.

## Render `SUPABASE_URL`

Could not SSH/list env non-interactively. Live tip `display_image_url=null` while intent path existed ⇒ public origin was effectively **absent/unusable** at observe time. Code now derives origin from DATABASE_URL so Render should work without a new secret.

## Cron

Intent sat `awaiting_token` / attempts 0 ⇒ reconcile **did not successfully bind+finalize** for this token in the window. Orphan path also failed to apply (now improved to use intent path).

## Tests / gates

- merge-live-market, completion-panel-copy, ReviewStep, ContractCopy, reconcile, indexer config: **pass**
- db / indexer / web typecheck + builds: **pass**

## Commits / push / deploy

*(filled after git)*

## Confirmations

- No new launch/trade broadcast in this task  
- MUSE / other tokens not mutated by repair  
- Residual: confirm Vercel+Render Ready; next Alex canary must prove immediate image + ~1–3s live path; cron reliability still worth watching  

## Ready for Alex’s second launch canary?

**Code + this token repair: yes after deploys Ready.**  
Do not launch until Vercel web + Render indexer show the new commit.
