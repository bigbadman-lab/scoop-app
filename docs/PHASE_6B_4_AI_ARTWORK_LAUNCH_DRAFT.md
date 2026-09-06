# Phase 6B.4 — AI Token Artwork + Editable Launch Draft

**Status:** READY  
**Date:** 2026-09-06  
**Scope:** Chosen 6B.3 concept → 3 distinct square token-art options → select into editable launch draft. No chain launch, no IPFS.

---

## Image model

- `OPENAI_IMAGE_MODEL` default **`gpt-image-2`**
- Size **1024×1024**, quality **medium**
- Exactly 3 images per generate request (iconic / memetic / editorial_abstract)
- One retry per failed image; no endless loops

## Styles

1. **iconic** — bold logo-like avatar mark  
2. **memetic** — punchy internet-native personality  
3. **editorial_abstract** — conceptual news-inspired illustration (not a fake press photo)

Prompts forbid publisher logos, corporate trademark cloning, watermarks, and documentary news photography. Article text is untrusted DATA.

---

## Temporary storage

Private Supabase Storage bucket: **`launch-draft-assets`**

Path: `news/<articleId>/<generationId>/art_N.png`  
Signed preview URLs only (service role). No public bucket. No image bytes in Postgres.

---

## Schema

Migration: `supabase/migrations/20260906180000_phase_6b4_launch_drafts.sql`

- `launch_drafts` — news/standard source, name/symbol/description, quote, selected artwork, status=`draft`
- `launch_draft_artworks` — generation set, style, storage path, model/quality, selected flag

---

## API / CLI

```bash
pnpm news:draft:create --article <id> --concept <1|2|3>
pnpm news:draft:artwork --draft <uuid>
```

Internal routes (same gate as concepts):

- `POST /api/internal/launch-drafts`
- `GET|PATCH /api/internal/launch-drafts/[id]`
- `POST .../artwork/generate`
- `POST .../artwork/select`

---

## Behavior

- Create draft: reload article, revalidate concept + live quote (reject if quote disabled; no silent swap)
- Generate artwork: new generation set of 3; does not clear prior selection
- Select: artwork must belong to draft; exactly one selected
- Edit: name/symbol/description; pair only to currently enabled quotes

## IPFS

Deferred to Phase 6C / final launch prep. Selected private asset → pin → `ipfs://` → ScoopFactory metadata later.

## Live smoke

Article `104136341` (oil / Bessent) → concept_1 **Flood the Barrel / FLOOD** → ETH pair.

- Draft `900c72a7-9c75-458d-99f6-f6f9653de056`
- Generated **3** images (`gpt-image-2`, medium, 1024²) in ~159s; private storage + signed previews OK
- Selected iconic `art_1`; edit description + reload preserved selection

Approximate cost: not returned by API in this run (usage metadata absent); treat as 3× medium 1024 gpt-image-2 generations.

## Next

**Phase 6C — Unified Launch Flow** merges news + standard `/launch` into one draft → IPFS → ScoopFactory path.
