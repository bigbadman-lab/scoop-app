# Manual image repair — `0xd0e0f715…`

## 1. Verdict

## `PASS — TOKEN IMAGE DIAGNOSED AND MANUALLY REPAIRED`

## 2–4. Repo

| Field | Value |
| --- | --- |
| Pre-HEAD | `a281962c543562f1b11d9ac8667d94e58df1e406` |
| Final HEAD | unchanged (data repair + audit only) |
| Branch | `main` |
| Git status | unrelated untracked audits/`P10.4-*` only |

## 5–9. Token

| Field | Value |
| --- | --- |
| Address | `0xd0e0f7158e5b4741577c5bfbcc7dbf5143ba0ba6` |
| Name / symbol | Target 110 / **T110** |
| Launch tx | `0xc230af0a993c62afd33a218357e820320a3b204bb697385d8ed1ea44cbbc52d6` |
| Launch block / time | `63029050` / chain ts `1789411406` (~2026-09-14T18:43:26Z); indexed `created_at` `2026-09-14T18:43:40.558Z` |
| Onchain `image_uri` | `ipfs://bafkreiclg5m2graeqq2u3ghkztzhcirx53yrrol24q73fps5garpb7s7o4` |
| Quote / deployer | `0x5fc5…d168` / `0x025f3f91…937a` |

## 10–11. Pre-repair state

| Field | Value |
| --- | --- |
| `display_image_url` | **null** |
| Intent | `9e459fc8-…` — `awaiting_token`, `token_address=null`, `attempts=0`, path `manual/4b3759a344048435/4b3759a344048435.png`, created `18:43:17Z` (before index) |
| Live tip | Had correct public display URL, but `source_block` (63030407) ≤ main checkpoint → tip **not** merged into APIs |

## 12–19. Did it save to Supabase?

### **YES**

| Field | Value |
| --- | --- |
| Bucket | `token-image` (public) |
| Object path | `manual/4b3759a344048435/4b3759a344048435.png` |
| Public URL | `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/manual/4b3759a344048435/4b3759a344048435.png` |
| HTTP | **200** |
| MIME | `image/png` |
| Size | 9724 bytes (512×512 RGBA) |
| Uploaded | `last-modified: 2026-09-14T18:43:18Z` (matches pin/intent) |

Manual path convention from code: `manual/{hash16}/{hash16}.{ext}` (`buildManualTokenDisplayImagePath`).

## 20–21. IPFS vs Supabase

| Source | Status | SHA-256 |
| --- | --- | --- |
| Pinata gateway | 200 `image/png` 9724 | `4b3759a3440484354d98eaccf2712237eef118b97ae43fb2be5d3022f0fe5f77` |
| Supabase object | 200 `image/png` 9724 | **identical** |

Manual upload and onchain IPFS are the **same bytes**.

## 22–24. API / UI before repair

| Surface | `displayImageUrl` | `imageUri` |
| --- | --- | --- |
| `/api/tokens/…` | null | ipfs://bafkrei… |
| `/api/markets` | null | ipfs://… |
| `/api/discover` | null | ipfs://… |

UI `pickTokenImageSrc(null, ipfs)` → `https://ipfs.io/ipfs/bafkrei…` (gateway fallback). Durable Supabase URL was never on the canonical row after tip filter dropped live overlay.

## 25–27. Root cause

**First failing stage: server-owned finalization never applied to `tokens.display_image_url`.**

1. Manual pin **did** write Supabase `manual/…` and create finalize intent with that path.  
2. Intent remained `awaiting_token` / unbound (`attempts=0`) — cron bind/finalize did not land (same class as prior canaries).  
3. Live tip briefly held the correct HTTPS URL, then became invisible to APIs once `source_block ≤ main checkpoint`, while canonical `display_image_url` stayed null.  
4. Site fell back to IPFS gateway instead of the already-public Supabase object.

Classification: **finalization / binding failure**, not storage failure, not wrong manual upload.

## 28–36. Repair

- Set `tokens.display_image_url` to existing public manual URL (no re-upload).  
- Bound intent → `done` for this token.  
- `image_uri` unchanged.  
- MUSE / 2HAWK display URLs unchanged.

### After

| Check | Result |
| --- | --- |
| Direct URL | HTTP 200 `image/png` |
| Token API | `displayImageUrl` = repaired URL |
| Markets / discover | same URL |
| Token page HTML | embeds `4b3759a344048435.png` |

## 37–39. Code change

**None** in this task (manual repair + diagnosis). Broader cron/bind reliability remains a follow-up.

## 40. Prevent recurrence

1. Ensure reconcile cron reliably binds `awaiting_token` intents by `image_uri` within minutes of index.  
2. Soften live-tip filter so a valid live/`manual/` `display_image_url` can still fill canonical-null display after confirm (image-only), without re-overlaying stale price/volume.  
3. Or: finalize display in the same request path as pin once token address is known from receipt (path already known).

## 41. Resolved for this token?

**Yes.**

---

**The image for `0xd0e0f7158e5b4741577c5bfbcc7dbf5143ba0ba6` has been traced from manual upload through Supabase/IPFS to the website, the exact failure point has been identified, and the production token now renders the correct image using a durable HTTPS display URL.**
