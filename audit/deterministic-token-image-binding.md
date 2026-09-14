# Deterministic immediate token image binding

## 1. Verdict

## `PASS — TOKEN IMAGES NOW BIND DETERMINISTICALLY AFTER RECEIPT`

## 2–4. Repo

| Field | Value |
| --- | --- |
| Pre-HEAD | `f07db2961df978a1e419bef6e18c069d230a2382` |
| Final HEAD | `2ccf0af` (`f264d67` web/db + `2ccf0af` indexer) |
| Branch | `main` |
| Status before | unrelated untracked audits / `P10.4-*` only |
| Status after | same unrelated untracked files |

## 5. Prior failure mode

Proven on T110 / 2HAWK / MUSE class:

1. Manual/generated image **did** land in Supabase `token-image/…`
2. Pin created `token_display_finalize_intents` row (`awaiting_token`, path set, `attempts=0`)
3. Receipt decode knew the token address
4. Binding/finalization never applied → `tokens.display_image_url` stayed null
5. Live tip briefly held HTTPS URL, then dropped under checkpoint filter
6. UI fell back to IPFS gateway
7. 2-minute cron was the *de facto* normal path and still missed these cases

Root cause class: **non-deterministic post-receipt bind**, including upsert creating a *new* pending intent instead of binding the existing `awaiting_token` row by `image_uri`.

## 6. Architecture before

```text
pin → awaiting_token intent
launch receipt → optional browser POST /api/launch/display-image (wait up to 60s for index)
                  OR hope cron binds by image_uri within ~2m
indexer upsertToken → image_uri only (no display_image_url)
```

## 7. Architecture after

```text
pin → awaiting_token intent (trusted path)
receipt decode → POST /api/launch/display-image/bind
              → bind existing intent to token_address (pending)
              → return public Supabase URL immediately (even if tokens row absent)
canonical launch index → applyBoundDisplayImageOnTokenInsert
                      → set tokens.display_image_url from bound/awaiting intent
                      → mark intent done
cron (*/2) → recovery only
live merge → confirmed HTTPS > live HTTPS > imageUri (unchanged safety net)
```

## 8. Receipt-side integration

`runLaunchCompletion` → `ensureTokenDisplayImage` → `POST /api/launch/display-image/bind`  
Starts immediately in parallel with indexer wait; `waitForIndex: false`; AbortSignal not honored for durability.

## 9. Server endpoint / function

| Piece | Location |
| --- | --- |
| Core op | `bindAndFinalizeTokenDisplayImage` — `apps/web/src/lib/launch/bind-token-display-image.ts` |
| HTTP | `POST /api/launch/display-image/bind` |
| DB bind | `bindDisplayFinalizeIntentToToken` — `packages/db` |
| Indexer enrich | `applyBoundDisplayImageOnTokenInsert` — `packages/db` |

Response shape: `{ ok, displayImageUrl, bound, finalized, source, tokenRowPresent }`.

## 10. Trusted identity

Match order:

1. Existing open finalize intent for exact `image_uri` (pin-time)
2. Client may hint `displayImagePath` / `draftId` only to **enrich** that intent (allowlisted)
3. Never accepts client `displayImageUrl`

## 11. Security validation

- Session required in production
- Rate limit 40/min
- `chainId === SCOOP_CHAIN_ID`
- Address parse
- `imageUri` must be `ipfs://`
- Bind **does not create** intents (no arbitrary path injection onto random tokens)
- Path allowlist (`drafts/` / `manual/` / `canonical/`)
- Server derives HTTPS URL from Supabase origin + path

## 12. Manual upload path

`manual/{hash16}/{hash16}.png` — covered by bind-before-row + bind-after-row + T110 regression tests.

## 13. Generated / Launch Assist path

`drafts/{draftId}/{assetId}/{hash16}.png` — covered by generated-image bind test.

## 14. Bind before token row

Succeeds: intent → `pending` + token bound; returns public URL; `finalized: false`.

## 15. Token row before bind

Succeeds: writes `tokens.display_image_url`; marks intent `done`; `finalized: true`.

## 16–17. Canonical application / indexer

**Yes — indexer changed.** After `upsertToken` + `upsertLaunch`, `applyBoundDisplayImageOnTokenInsert` applies trusted path. Errors are logged and do not stop launch indexing.

## 18–19. Live overlay / takeover

`bestImageFields` already prefers confirmed HTTPS, else live HTTPS. Tip lookup also considers `done` intents so path URLs remain resolvable during the brief race. Canonical enrichment removes reliance on live tip for the normal path.

## 20. Cron role

**Recovery only** (closed tab, bind HTTP failure, deploy blip, missed enrichment). Documented in reconcile helper + cron route comments.

## 21–23. Idempotency / retry / failure

- Repeat bind → same URL, `source: existing` when already set
- Indexer apply skips when URL already matches
- Bind/HTTP failure: launch still succeeds; local preview + live tip + cron recovery remain
- Both orderings (bind↔index) covered

## 24. Status transitions

`awaiting_token` → `pending` (receipt bind) → `done` (canonical write or bind-when-row-present)  
Healthy path no longer leaves launched tokens at `awaiting_token` / `attempts=0`.

## 25–30. Tests

| Case | Coverage |
| --- | --- |
| T110 regression | `bind-token-display-image.test.ts` |
| Manual before/after row | same |
| Generated draft path | same |
| Idempotency | same + `applyBoundDisplayImageOnTokenInsert` |
| Security (non-ipfs, bad path, missing intent) | same |
| Client bind POST | `ensure-display-image.test.ts` |
| Completion wiring | `complete-launch.test.ts` (`waitForIndex: false`) |
| Live null wipe | existing `merge-live-market.test.ts` |
| Indexer apply | `token-display-finalize-intents.test.ts` |
| Prior finalize/reconcile | still pass |

## 31. Typecheck / build

- `@scoop/db` typecheck + build: pass
- `@scoop/indexer` typecheck + build: pass
- `@scoop/web` typecheck + build: pass
- Related vitest suites: pass

## 32–33. Commits / push

| Commit | Message |
| --- | --- |
| _(web/db)_ | `fix(web): finalize token images immediately after launch` |
| _(indexer)_ | `fix(indexer): apply bound token display images on launch index` |
| _(docs)_ | `docs(audit): record deterministic token image binding` |

Pushed to `origin/main`.

## 34–35. Deploy

- Vercel web: required Ready on new SHA
- Render indexer: required Ready (enrichment lives in indexer)

## 36–37. Confirmations

- No new launch / trade broadcast in this task
- T110 display URL left intact; no bulk unrelated mutation (pre-check: 3 tokens with display URLs)

## 38. Remaining risks

- If pin never recorded an intent, bind correctly returns `INTENT_NOT_FOUND` (cron orphan + IPFS mirror remain recovery)
- Browser closed *before* bind request leaves intent `awaiting_token` until indexer enrichment (by `image_uri`) or cron
- Deploy must land **both** web and indexer for full dual-ordering coverage

## 39. Cron recovery-only?

**Yes.**

## 40. Next launch immediate image everywhere?

**Yes — expected**, once Vercel + Render are Ready on these commits: receipt bind returns the Supabase URL immediately; indexer writes canonical `display_image_url` on insert; APIs prefer that HTTPS URL.

## 41. Ready for Alex’s next launch canary?

**Yes, after both deploys show Ready.** Do not launch in this task.

---

**New SCOOP launches now bind their already-stored Supabase token image to the receipt-decoded token address immediately through a server-owned path. Canonical token image state is applied deterministically regardless of whether receipt binding or indexing happens first, while the 2-minute reconciliation cron remains recovery-only. New tokens should appear across SCOOP with the correct image from the moment the market appears.**
