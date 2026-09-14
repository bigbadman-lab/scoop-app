# Durable token image Supabase persistence fix

## 1. Verdict

**PASS — DURABLE TOKEN IMAGE PERSISTENCE FIX DEPLOYED**

## 2. Pre-HEAD

`f80bd05c9dbf30e3e22635a87c83d12979053b87` (`docs(audit): finalize TAPE runtime contract report`)  
Branch: `main`

## 3. Root cause confirmed

Indexer writes only `tokens.image_uri` (IPFS). `tokens.display_image_url` was applied solely via a best-effort browser call after index (`runLaunchCompletion` → `ensureTokenDisplayImage` → `POST /api/launch/display-image`). Tab close / abort / draft-copy failure left tokens permanently IPFS-only in the UI.

## 4. Chosen architecture

**Option A + B:** shared server-side `finalizeTokenDisplayImage` owned by `POST /api/launch/display-image`, started immediately on launch completion **in parallel** with indexer wait (not aborted by completion AbortSignal).

## 5. Why smallest safe fix

Reused existing path allowlist, draft apply helpers, and pin-time uploads. Did **not** teach the indexer about Supabase. Added IPFS→`token-image` mirror only as fallback when path/draft copy is missing.

## 6. Shared durable finalizer

`apps/web/src/lib/launch/finalize-token-display-image.ts` → `finalizeTokenDisplayImage`

Priority: existing HTTPS display → allowlisted path → draft artwork URL → IPFS mirror.

## 7. Exact server-side persistence path

1. Receipt → `runLaunchCompletion` fires `POST /api/launch/display-image` with `waitForIndex: true` (no client abort).
2. Server polls `tokens` up to ~60s.
3. Applies path / draft / `ipfs://`→`canonical/{cid}/{cid}.{ext}` upload.
4. Sets `tokens.display_image_url` to derived public HTTPS URL.

## 8. Launch Assist after fix

Still best-effort draft copy at select. If missing, finalizer falls back to canonical `ipfs://` mirror into `token-image/canonical/...` and sets display URL.

## 9. Manual upload after fix

Still uploads `token-image/manual/...` at pin. Finalizer reuses that path (no reupload) once the token row exists.

## 10. IPFS fallback

`mirrorIpfsUriToTokenImage` (`packages/news`): gateway fetch → MIME/size validation → upsert `canonical/{cid}/...`.

## 11. Supabase bucket/path

Bucket: `token-image` (public). Paths: `drafts/…`, `manual/…`, `canonical/…` (allowlisted).

## 12. `tokens.image_uri`

Unchanged — remains canonical on-chain/IPFS metadata.

## 13. `tokens.display_image_url`

Set only by durable finalizer / apply helpers (HTTPS Supabase public URL). Never overwritten with IPFS.

## 14. Retry behavior

Poll every 2.5s, timeout 60s (`maxDuration = 90` on the API route).

## 15. Idempotency

Already-set display → skip. Existing object HEAD → reuse. Content-addressed paths + `x-upsert`. Duplicate calls do not create new objects.

## 16. Browser dependency removed?

**Yes for correctness**, once the finalize request reaches the server. Client call remains the trigger but:
- starts immediately at completion
- ignores completion AbortSignal (`honorAbort: false`)
- server owns wait + apply + IPFS mirror

Optional convenience only; not the sole durable owner of bytes once in-flight.

## 17. API route changes

`POST /api/launch/display-image` now calls `finalizeTokenDisplayImage`; accepts `imageUri`, `waitForIndex`; session/rate-limit unchanged.

## 18. Indexer changes

None.

## 19. Frontend changes

`LaunchFlowLive` / `pending-completion` pass `imageUri`; `pickTokenImageSrc` unchanged (still prefers display HTTPS, IPFS fallback).

## 20. Logging

Structured `[token-display-finalize]` JSON: token, source/route, upload, dbUpdated, retries, errors. No secrets/bytes.

## 21. Tests added/updated

- `finalize-token-display-image.test.ts`
- news `token-image-storage` / mirror / canonical path
- `ensure-display-image`, `complete-launch`, `pending-completion`

## 22. Test results

Relevant unit suites: **pass**

## 23. Build results

`@scoop/db`, `@scoop/news`, `@scoop/web` build: **pass**

## 24. Files changed

- `packages/db/src/repos/tokens.ts` (`getTokenImageFields`)
- `packages/news/.../token-image-storage.ts`, `mirror-ipfs-display.ts`, exports/tests
- `apps/web/.../finalize-token-display-image.ts` (+ tests)
- `apps/web/.../display-image/route.ts`
- `ensure-display-image.ts`, `complete-launch.ts`, `LaunchFlowLive.tsx`, `pending-completion.ts`

## 25. Migration changes

None.

## 26–31. Commit / push / deploy / HEAD / status

Filled after git + Vercel verification.

## 32. Manual canary steps (Alex, via scoop.fun)

1. Launch Assist: generate → select artwork → launch a real token (separate step).
2. Confirm `tokens.display_image_url` is HTTPS `…/token-image/…` (not null) shortly after index.
3. Manual upload path: upload image → launch → same check.
4. Confirm token page / markets prefer Supabase image; IPFS still works if display null.
5. Optional: close tab soon after receipt and verify display still lands (server finalize in flight).

Do **not** backfill old canaries in this task.

---

**Both Launch Assist-generated and manually uploaded token images now have a durable server-side path to Supabase `token-image` and `tokens.display_image_url`; no production canary was launched during this task.**
