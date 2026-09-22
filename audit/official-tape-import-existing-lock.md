# Official $TAPE import with existing Streamflow lock

## Verdict

```text
PASS — OFFICIAL $TAPE IMPORTED AND LIVE WITH EXISTING LOCK VERIFIED
```

UTC: `2026-09-22T20:10:00Z`

```text
NEW STREAMFLOW LOCK CREATED: NO
BLOCKCHAIN TX BROADCAST: NO
SUPPORT BUY MADE: NO
PRIVATE KEY USED: NO
```

---

## 1. Mint

```text
9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump
```

## 2. Creator / deployer

```text
44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27
```

Creator match: **YES**

## 3. Pump provenance

| Field | Value |
| --- | --- |
| Provenance | `verified` |
| Bonding curve | `a2u39NNwBXpWfi1Fnzb7mvyGWifYFsLwY2VYLGbDD6c` |
| Launch signature | `5Rij8tdDqsLs3FWc1rr3RT7A8hvtNEFFpeZG7ioXJr82CZinH9vJQAYBcitu2QTABoE58LDHB5xu9AsiZs3WNwxf` |
| Name | SCOOP |
| Symbol | TAPE |
| Decimals | 6 |

## 4. Metadata / image

| Field | Value |
| --- | --- |
| Metadata URI | `https://ipfs.io/ipfs/bafkreihgz6grlzmggzkeyrnistxxmlkbfwowa3og5vx6dirl7gk4uylssi` |
| Image URI | `https://ipfs.io/ipfs/bafybeialattijm7j2mj3wr7n5cfeazhfw7jbwragklcns3cey363flobjy` |
| Display image | `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/canonical/bafybeialattijm7j2mj3wr7n5cfeazhfw7jbwragklcns3cey363flobjy/bafybeialattijm7j2mj3wr7n5cfeazhfw7jbwragklcns3cey363flobjy.png` |

Notes: `ipfs.io` returned HTTP 429 during first import; metadata fetch now retries with Pinata/dweb gateways; HTTPS IPFS image URIs are normalized to `ipfs://` before mirror.

## 5. Import result

| Field | Value |
| --- | --- |
| Path | `preflightExternalPumpMint` → `importExternalPumpMarket` (`importKind: official`) |
| Created | YES |
| Registry kind | `official` (not canary) |
| Watchlist | YES |
| chain_id | `900001` |
| market_source | `pump` |

## 6. Token page

```text
https://scoop.fun/token/9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump
```

| Check | Result |
| --- | --- |
| HTTP | 200 |
| Title | `SCOOP (TAPE) · SCOOP` |
| Mint present | YES |
| Solana / Pump | YES |
| Mirrored image | YES (canonical Supabase URL in SSR HTML) |

Official badges / homepage CA bar ship with the web deploy of this commit (DB already registered).

## 7. Alchemy / market data

| Check | Result |
| --- | --- |
| Watchlist present after import | YES |
| `/api/markets` includes TAPE | YES |
| `displayImageUrl` | Supabase canonical HTTPS |

Worker will pick up the mint via normal watchlist refresh (no hard-coded mint).

## 8. Existing Streamflow lock (verified onchain)

| Field | Value |
| --- | --- |
| Lock ID | `A1WDQSPLGJorTrjAh3jPLz2AVzqRvXyYXrhth9MU8zVQ` |
| Creation tx | `2FJCEpjF4osSqfqtBuSz7xngTFQNnVk7t6t5PeZGzPEwTmnLi5R8PzDh3hVnPWMBzm5cdFjpZt63PirLREMqvJW4` |
| Sender | `44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27` |
| Recipient | `44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27` |
| Mint | `9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump` |
| Amount (raw) | `30724077391043` |
| Amount (human) | `30724077.391043` |
| % of supply | `3.07%` |
| Created UTC | `2026-09-22T19:52:50.000Z` |
| Unlock UTC | `2027-08-31T23:00:00.000Z` |
| Cancelable | NO / NO |
| Transferable | NO / NO |
| Token lock | YES (`isTokenLock`) |
| Exactly 6 calendar months | **NO** |

Badge wording (truthful):

```text
DEV TOKENS LOCKED UNTIL 2027-08-31
```

Liquid deployer TAPE after lock: `1665018.827526`

## 9. Official config path

`protocol_settings.tape_official_solana` (JSON) via `setOfficialTapeSolanaConfig`

| Field | Value |
| --- | --- |
| Status | `inserted` |
| lockVerified | `true` |
| lockId | `A1WDQSPLGJorTrjAh3jPLz2AVzqRvXyYXrhth9MU8zVQ` |
| unlockAt | `2027-08-31T23:00:00.000Z` |
| lockBadgeCopy | `DEV TOKENS LOCKED UNTIL 2027-08-31` |

## 10. Homepage announcement

Implemented as `OfficialTapeContractBar` (green SCOOP strip) driven by DB official config — not the empty static `ANNOUNCEMENTS` array.

Shows: Official $TAPE contract · Solana · full mint · COPY · lock badge when verified.

Live after Vercel deploy of this commit.

## 11. Mobile verification

Code path uses mobile-safe truncate + full-mint clipboard. Production WebKit pass deferred to post-deploy browser check (token page SSR already 200 with mint/image).

## 12. `/markets`

TAPE present with Solana/Pump identity and mirrored image (API smoke PASS).

## 13. Exact files changed

| File | Purpose |
| --- | --- |
| `package.json` | `official:publish` script |
| `apps/web/scripts/official-publish.mts` | Lock-free publish CLI |
| `apps/web/src/lib/official-tape/verify-existing-streamflow-lock.ts` | Read-only Streamflow verify |
| `apps/web/src/lib/official-tape/env-audit.ts` | `readyForPublish` (no keypair) |
| `apps/web/src/lib/official-tape/official-config.ts` | Optional `lockBadgeCopy` |
| `apps/web/src/lib/official-tape/load-official-tape-public.ts` | Public loader for shell/token |
| `apps/web/src/lib/launch/import-external-pump-market.ts` | Metadata 429 retry + IPFS gateways |
| `apps/web/src/lib/launch/ensure-token-display-image-from-ipfs.ts` | HTTPS IPFS → gateway mirror |
| `apps/web/src/components/home/OfficialTapeContractBar.tsx` | Homepage CA bar |
| `apps/web/src/components/token/OfficialTapeTokenBadges.tsx` | Token page badges |
| `apps/web/src/components/shell/AppShell.tsx` | Wire official bar |
| `apps/web/src/app/layout.tsx` | Load official config |
| `apps/web/src/app/token/[address]/page.tsx` | Official badges prop |
| `apps/web/src/components/token/TokenMarketShell.tsx` | Pass badges |
| `apps/web/src/components/token/TokenMarketLiveView.tsx` | Render badges |
| Tests under `official-tape/` + publish safety | Focused coverage |

## 14. Commit SHA

`7c86c92d83213516d4f3a5ba28f36840851110da`

## 15. Vercel deployment

| Field | Value |
| --- | --- |
| SHA | `7c86c92` |
| Status | **Ready** (`Deployment has completed` / success) |
| Preview URL | `https://scoop-csgo32f83-cope2.vercel.app` |
| Homepage bar | PASS — `official-tape-contract-bar`, mint, Official $TAPE, lock badge present on `https://scoop.fun/` |

---

## Operator command used

```bash
pnpm official:publish --mint 9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump --preflight-only
pnpm official:publish --mint 9DvtnrMoGWwGpBQUqMWhTxxtRjsuuBPE6Uu9ZNn5pump
```

---

## Exact next step

```text
NEXT STEP: OFFICIAL $TAPE IS LIVE ON SCOOP. BEGIN NORMAL LAUNCH COMMUNICATIONS AND MARKET MONITORING.
```

After web deploy: confirm homepage CA bar + token badges on desktop/mobile browsers.
