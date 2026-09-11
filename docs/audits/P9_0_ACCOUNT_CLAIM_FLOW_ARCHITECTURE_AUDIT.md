# P9.0 Account + Claim-Flow Architecture Audit

**Status:** Discovery only (read-only)  
**Baseline:** `main` @ `bf8349e` (`feat: add deterministic holder rewards worker`)  
**Date:** 2026-09-11  
**Scope:** Map `/account`, wallet/session identity, reusable claim TX patterns, HolderRewards ABI/address discovery, P8 entitlement model, server boundary, historical compatibility. No application/runtime/on-chain changes.

---

## A. Executive summary

P9 should treat holder rewards as a **wallet-address Merkle claim surface**, not a SCOOP-user feature. Reuse the existing creator-claim architecture on `/account`: server discovery of entitlements/proofs + client-side on-chain authority (`isPaid` / `round`) + `simulateContract` → `writeContract` → receipt → event verify.

**Recommended shape:**

1. New sibling section after Fees on `/account` (`AccountReady`), modeled on `CreatorClaimsLane` — not a third Fees column, not a new route/tab.
2. New authenticated (or address-keyed) server API that reads `holder_reward_entitlements` (+ worker round publish metadata) via `getServerPool()` / `@scoop/db`. Never expose `DATABASE_URL` or browser Supabase access to these tables.
3. Claim write path: new `lib/holder-rewards/*` helpers mirroring `lib/claims/execute-claim.ts`, targeting per-launch `launches.holder_rewards_address` with `scoopAbis.ScoopHolderRewards` / `claim(roundId, asset, account, amount, proof)`.
4. UI labels come from **on-chain facts** (`round.published`, `isPaid`); DB rows are a **proof convenience cache** only. Do not trust `push_status` (worker never updates it after push).
5. Gate all P5/P8 SQL behind schema/deployment mode so historical production (pre-P5) never SELECTs missing columns/tables. Hide the section when vault/schema/entitlements are absent.

---

## B. Current `/account` map

### Routes and layouts

| Role | Path |
|------|------|
| Page | `apps/web/src/app/account/page.tsx` — Server Component; renders `AccountPageClient` only |
| Nested layout | **None** (`app/account/layout.tsx` does not exist) |
| Root layout | `apps/web/src/app/layout.tsx` — `WalletShellProvider` + `AppShell` |
| Nav | `apps/web/src/components/shell/nav.ts` → `{ id: 'account', href: '/account' }` |

### API routes (existing)

| Endpoint | File | Auth |
|----------|------|------|
| `GET /api/account` | `apps/web/src/app/api/account/route.ts` | SIWE session |
| `GET /api/account/me` | `apps/web/src/app/api/account/me/route.ts` | SIWE (shell profile) |
| `PATCH /api/account/profile` | `apps/web/src/app/api/account/profile/route.ts` | SIWE |
| `POST /api/account/avatar` | `apps/web/src/app/api/account/avatar/route.ts` | SIWE |

All use `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`.

### Component hierarchy

```text
RootLayout (server)
└─ WalletShellProvider (client)
   └─ AppShell (client)
      └─ AccountPage (server)                         app/account/page.tsx
         └─ AccountPageClient (client)                components/account/AccountPageClient.tsx
            ├─ not configured → inline message
            ├─ !runtimeReady → AccountPagePending
            └─ dynamic → AccountPageLive              components/account/AccountPageLive.tsx
               ├─ loading → AccountPagePending
               ├─ signed_out → AccountSignedOut
               ├─ wallet_mismatch → AuthInterrupt
               ├─ error → AccountShell + Try again
               └─ ready → AccountReady
                  ├─ Profile (avatar + display name)
                  ├─ AccountSessionWalletPanel
                  │    ├─ SCOOP account
                  │    └─ Connected wallet
                  ├─ Tokens launched
                  └─ FeesSection
                       ├─ DeployerFeesLane   (display-only)
                       └─ CreatorClaimsLane  (on-chain claim)
```

No tabs. Vertical `<section>` stack inside `AccountShell` (`main.max-w-3xl`).

### Server vs client / data loading

- **No RSC data load** for the page body. Client `AccountPageLive.refresh`:
  1. `fetchScoopAuthStatus()`
  2. `resolveScoopAuthState({ session, connected wallet })`
  3. If authenticated → `GET /api/account` (`credentials: 'include'`, `cache: 'no-store'`)
- Server: `loadAuthenticatedAccount` (`apps/web/src/lib/account/load-account.ts`) → `getAuthenticatedScoopUser` → `getScoopAccountBundle` (`packages/db/src/queries/account.ts`).
- Bundle today: profile, launches, **deployer fees + creator fees only**. No holder-reward fields.

### Sections, empty/loading/error patterns

| Pattern | Location |
|---------|----------|
| Full-page skeleton | `AccountPagePending` (`aria-busy`) |
| Empty copy | Tokens / Deployer / Creator lanes |
| Creator loading | “Loading claimable balances…” |
| Connect gate | CreatorClaimsLane when no wallet |
| Page error | red alert + Try again |
| Claim row phases | `idle` → `simulating` → `awaiting_wallet` → `submitted` → `confirming` → `success` \| `error` |

Styling: CSS variables from `apps/web/src/app/globals.css`; mono uppercase labels; orange CTAs; `TokenImage`; no card system on this page.

### Where Holder Rewards should live

**Primary mount:** end of `AccountReady` in `AccountPageLive.tsx`, **after** `<FeesSection />` (~lines 374–378), as a new sibling `<section className="… border-t …">`.

Rationale: `FeesSection` copy is explicitly “two separate streams” (Deployer auto-pay + Creator claim). Holder rewards are a different vault/Merkle model. Mirror `CreatorClaimsLane` for wallet gates and claim UX. Also update `ACCOUNT_OPENERS` in `AccountSignedOut.tsx` for signed-out marketing parity. Do **not** put holder rewards in `/api/account/me` or shell chrome.

---

## C. Wallet/session identity map

### Connected wallet identity (signer)

| Layer | Implementation |
|-------|----------------|
| Connect UI | Reown AppKit (`WalletRuntimeProviders.tsx`) |
| Adapter | `@reown/appkit-adapter-wagmi` (`wagmi-config.ts`) |
| Live address | wagmi `useAccount().address` |
| Chain | Robinhood Chain `4663` (`lib/brand.ts`, `lib/auth/chain.ts`) |
| Normalize (display/crypto) | `normalizeAddress` → EIP-55 via viem `getAddress` (`lib/auth/address.ts`) |
| Compare | `addressesEqual` / `sessionAddress` (lowercase) |

Wrong-network UX exists on trade (`TokenBuySellLive`) and launch (`LaunchFlowLive`) via `useSwitchChain`. Creator claim path rechecks wallet account but **does not** currently recheck `ROBINHOOD_CHAIN_ID` — P9 should add explicit chain verification (copy launch pattern).

### SCOOP session identity (authenticated account)

Custom SIWE — **not** Supabase Auth / Privy / NextAuth.

```text
Connect → /api/auth/nonce → signMessage → /api/auth/verify
  → resolveVerifiedWalletIdentity → scoop_users / scoop_wallets
  → HMAC cookie scoop_session { userId, address, chainId=4663 }
```

| Helper | Role |
|--------|------|
| `getAuthenticatedScoopUser(request)` | Preferred server identity |
| `fetchScoopAuthStatus()` | Client session read |
| `resolveScoopAuthState(...)` | `signed_out` \| `session_only` \| `connected_unsigned` \| `authenticated_match` \| `wallet_mismatch` |
| `resolveOnChainWalletCapability` | Embedded wallets: `mayBroadcastOnChain: false` |

Session address is **lowercase**. DB addresses are lowercase (`packages/db/src/hex.ts`, identity migration constraint).

### Distinction (critical for P9)

| Concept | Source of truth | Use for |
|---------|-----------------|---------|
| **SCOOP user** | `scoop_session.userId` (UUID) | Profile, launches list, creator fee discovery keyed by user/wallet |
| **Entitlement / Merkle account** | Wallet address (lowercase) | Holder reward rows, leaf, `claim(..., account, ...)` |
| **Signer** | Live wagmi address when `authenticated_match` + chain 4663 + external wallet | Broadcast `claim` |

Holder rewards are **token ownership / wallet address**, not “logged-in userId alone.”

**Safest query key for entitlements:** SIWE session address (`getAuthenticatedScoopUser().address`), then require `authenticated_match` + external wallet before claim. Do not query by wagmi alone (disconnectable/mismatchable). Do not authorize from client `walletType` metadata.

Embedded/email wallets produce a real EVM address but are blocked from on-chain broadcast (`onchain-policy.ts`). Schema allows multiple `scoop_wallets` per user; runtime today effectively one active SIWE-bound address at a time.

---

## D. Existing reusable transaction patterns

### Classification

| Flow | Classification | Notes |
|------|----------------|-------|
| `CreatorClaimsLane` + `lib/claims/*` | **Reusable pattern** | Best template for holder `claim(...)` |
| `DeployerFeesLane` | Partially reusable | Display lane only |
| `GET /api/account` fee bundle | Partially reusable | Discovery feed pattern |
| `GET /api/creators/[creatorId]/earnings` | Partially reusable | Indexed summary; not claim authority |
| Trade `lib/trade/execute.ts` | Partially reusable | sim→write→receipt; different UX |
| Launch `lib/launch/execute.ts` | Partially reusable | Mandatory sim + chain recheck |
| `EarningsStep.tsx` / token Creator earnings / ProtocolSection | Unrelated | Config/marketing/display |
| `apps/fee-keeper/` | Unrelated | Operator backend |
| `apps/holder-rewards-worker/` | Unrelated to UI | Publish/push; leftover unpaid → claimable |

### Creator claim pattern (copy for P9)

| Concern | File / behavior |
|---------|-----------------|
| UI | `apps/web/src/components/account/CreatorClaimsLane.tsx` |
| Discovery | Indexed fee lines from `/api/account` via `discoverClaimAssetsFromFeeLines` |
| Authority | On-chain `readClaimableEth` / `readClaimableToken` (`read-claimable.ts`) — DB never overrides |
| Write | `executeWalletCreatorClaim` (`execute-claim.ts`): read → `simulateContract` → live-account recheck → `writeContract` → `waitForTransactionReceipt` → decode `ETHClaimed`/`TokenClaimed` |
| Phases | `ClaimRowPhase` in `lib/claims/types.ts` |
| Explorer | `robinhoodTxUrl` (`lib/chain/explorer.ts`) |
| Retry | Manual Claim retry + 20s poll; no React Query invalidation |
| Session gate | `sessionOnly` blocks claim |

**Best existing pattern for `ScoopHolderRewards.claim`:** clone `execute-claim.ts` + `CreatorClaimsLane`, swap ABI/address/args, add Merkle proof + `isPaid`/`round` prechecks, and add chain-id recheck from launch execute.

---

## E. HolderRewards contract integration

### ABI

- Path: `packages/contracts/src/abi/ScoopHolderRewards.json`
- Registry: `scoopAbis.ScoopHolderRewards` in `packages/contracts/src/abi.ts`
- Asserted in `packages/contracts/src/manifest.test.ts`
- Web app does **not** import HolderRewards today (no hand-curated fragment yet)

### Claim signature

```solidity
claim(uint64 roundId, address asset, address account, uint256 amount, bytes32[] proof) nonpayable
```

### Relevant reads

| Method | Purpose for P9 |
|--------|----------------|
| `isPaid(roundId, asset, account) → bool` | Authoritative paid/claimed (covers push **and** claim) |
| `round(roundId, asset) → (merkleRoot, totalCommitted, published)` | Round published + root for optional proof verify |
| `leafHash(roundId, asset, account, amount) → bytes32` | On-chain leaf (vault/chainId are contract immutables) |
| `NATIVE_ASSET()` | ETH sentinel address for asset param |
| `uncommitted` / `outstandingCommitted` / `totalDeposited` / `totalPaid` | Diagnostics / optional UI |

### Relevant events

| Event | Use |
|-------|-----|
| `HolderRewardClaimed(roundId, asset, account, amount)` | Receipt verification after user claim |
| `HolderRewardPushed` / `HolderRewardPushFailed` | Indexer/worker; not user claim UX |
| `HolderRewardRoundPublished` | Indexer/worker |

### Merkle helpers (off-chain)

`packages/shared/src/holderRewardsMerkle.ts`:

- Leaf: `keccak256(bytes.concat(keccak256(abi.encode(chainId, vault, roundId, asset, account, amount))))`
- Tree: OpenZeppelin-style commutative pairwise keccak
- `holderRewardLeafHash`, `buildHolderRewardMerkleTree`, proof verify

### Addresses

- **Not** in global canary/canonical manifest as a single protocol address.
- **Per-launch vault:** `launches.holder_rewards_address` (P5).
- Historical launches → typically `null`.
- Canonical P3 launches emit `holderRewards` in `TokenLaunched` / economics events; indexer persists via `upsertLaunch` / `upsertLaunchEconomics` (`packages/db/src/repos/launches.ts`, COALESCE never nulls out).
- Web token decode currently **drops** `holderRewards` from public DTOs (`decode-launch.ts` has the field in ABI fragment but token page does not expose vault).

Worker already reads/writes via `apps/holder-rewards-worker/src/chain.ts` (`isPaid`, `publishRound`, `pushBatch`) — best ABI usage reference outside contracts package.

---

## F. P8 entitlement data model

### Migration

`supabase/migrations/20260910220000_p8_holder_rewards_worker.sql`  
Header: **“Additive. Do not apply remotely in P8.”**  
**No RLS** on either table.

### `holder_reward_worker_rounds`

| Item | Value |
|------|-------|
| PK | `(chain_id, vault_address, round_id, asset_address)` |
| Snapshot | `snapshot_block`, `hour_end_unix` |
| Merkle | `merkle_root` (nullable until computed; lowercased) |
| Amounts | `reward_amount_raw`, `eligible_supply_raw`, `leaf_count` |
| Status | `pending` … `published` … `settled` / `failed` / skip variants |
| Publish | `published_tx_hash`, `published_at` |
| Index | `(chain_id, status, round_id)` |

### `holder_reward_entitlements`

| Item | Value |
|------|-------|
| PK | `(chain_id, vault_address, round_id, asset_address, account_address)` |
| Wallet field | `account_address` (lowercase `CHAR(42)`) |
| Amount for claim | `entitlement_raw` (leaf amount; **not** `balance_raw`) |
| Leaf / proof | `leaf_hash`, `leaf_index`, `proof_json` JSONB (`Hex[]`) |
| Push bookkeeping | `push_status` ∈ `unpaid \| paid \| failed \| skipped` (default `unpaid`) |
| Claim column | **None** |
| Snapshot | `snapshot_block` only |
| Index | partial unpaid index |

Writes: `replaceWorkerEntitlements` / `listWorkerEntitlements` / `updateEntitlementPushStatus` in `packages/db/src/queries/holder-rewards-worker.ts`.

**Important:** `updateEntitlementPushStatus` is **exported but never called** by `apps/holder-rewards-worker/`. After successful push, `push_status` may remain `unpaid`. Worker checks paid state via on-chain `isPaid`.

### Related P5 indexed tables

`supabase/migrations/20260910210000_p5_canonical_fee_holder_state.sql`:

- `launches.holder_rewards_address` (+ fee economics columns)
- `holder_reward_deposits`, `holder_reward_rounds`, `holder_reward_payouts` (`payout_type` `push|claim`)

Also no RLS in that migration.

### Can the UI submit stored `proof_json` directly?

**Yes for the bytes, with trust/validation gates.**

| Layer | Fact |
|-------|------|
| Format | Worker stores the same `bytes32[]` used by `pushBatch` / `claim`. `listWorkerEntitlements` parses `proof_json` and feeds push without regenerating proofs. |
| Trust boundary | Rows written only by worker via server Postgres (`DATABASE_URL`). Not browser-writable. No RLS/anon grants. |
| Public nature | Merkle proofs are not secrets; integrity is the **on-chain published root**. |
| Required validation before labeling Claimable / calling claim | (1) Round published on-chain (`round(...).published` and root match). (2) Optional: recompute `holderRewardLeafHash` + verify proof against root. (3) `isPaid == false`. (4) Connected wallet == `account_address`. (5) Pass `entitlement_raw` as `amount`. |
| Regeneration | Not needed if stored root still matches published on-chain root. Worker refuses silent root divergence on recompute. |

Treat entitlement rows as a **convenience cache**. Treat on-chain root + `isPaid` as authority.

---

## G. Proposed claimability state machine

Derived from P8 schema + `ScoopHolderRewards` semantics (not product inventiveness).

| UI state | Meaning | Authoritative source |
|----------|---------|----------------------|
| **No rewards** | No entitlement rows for wallet (or feature gated off) | DB query empty **and/or** schema/mode disabled |
| **Pending round** | Entitlement computed but root not published | Worker round `status` not `published` **and/or** on-chain `round.published == false` |
| **Claimable** | Published, unpaid, proof available, wallet matches | DB proof row + on-chain `published == true` + `isPaid == false` |
| **Push pending** | Worker attempting permissionless push (optional subtle state) | Worker round `push_in_progress` (DB); still verify `isPaid` before claim CTA |
| **Pushed** | Paid via worker `pushBatch` | On-chain `isPaid == true` (event may be push, not claim) |
| **Claim submitted** | User tx in flight | Local row phase (`submitted`/`confirming`) |
| **Claimed** | Paid via user `claim` (or indistinguishable from pushed) | On-chain `isPaid == true` + optional `HolderRewardClaimed` in receipt |
| **Unavailable / error** | Null vault, missing schema, proof/root mismatch, embedded wallet, wrong chain, mismatch session | Feature gate / validation failures |

### Database/worker facts (discovery only)

- Entitlement exists (`entitlement_raw`, `proof_json`, `leaf_hash`)
- Worker round status / `merkle_root` / `published_tx_hash`
- `push_status` — **informational at best; do not drive Claimable/Claimed**

### On-chain authoritative facts

- Vault contract exists at `holder_rewards_address`
- `round(roundId, asset).published` and `merkleRoot`
- `isPaid(roundId, asset, account)`
- Successful receipt + `HolderRewardClaimed` for user-initiated claims

**Do not** label Claimable from DB alone. **Do not** label Claimed from `push_status` or indexer alone without `isPaid` confirmation for the UX that gates the Claim button.

---

## H. Recommended server/API boundary

### Existing conventions

- Product data: Next.js route handlers under `apps/web/src/app/api/**/route.ts` (not Server Actions).
- DB: `getServerPool()` → `DATABASE_URL` (`lib/server/db.ts`); `@scoop/db` “service-role” means **server Postgres**, not browser Supabase.
- Address validation: `parseAddress` / `parseChainId` (`lib/server/validate.ts`) → lowercase.
- Secret leakage guard: `assertNoSecretLeakage` on JSON responses.
- Public market APIs are unauthenticated; `/api/account/*` requires SIWE.

### Recommended P9 endpoint

Prefer extending the account surface (matches Fees discovery):

```text
GET /api/account/holder-rewards
```

or include a `holderRewards` block in `GET /api/account` once P8 is applied and mode-gated.

**Response should include (per entitlement):** vault, token, roundId, asset, account, entitlementRaw, proof, leafHash, snapshotBlock, workerRoundStatus, publishedTxHash (if any). Omit internal worker errors if noisy.

**Server rules:**

1. Query only via server pool; never Realtime allowlist these tables (`lib/realtime/tables.ts` does not include them today — keep it that way).
2. Key rows by **session address** (lowercase). Optionally accept no client-supplied account override to avoid cross-wallet scraping from authenticated route.
3. **Login:** require SIWE for `/api/account/holder-rewards` (consistent with account fees). Unsigned connected wallets can still trade; they must Join before seeing the account claim surface (matches current `/account` gate).
4. **Proofs in browser:** allowed — they are public Merkle data needed to build the tx. Returning them through server code is correct; do not put service credentials in the client.
5. **RLS:** irrelevant until policies exist; today only server Postgres can read these tables after migration.
6. Mode-gate SQL: if P5/P8 absent, return empty payload / feature flag off — never throw undefined-column errors into `/account`.

Unauthenticated public `?account=` proof lookup is technically viable (Merkle public) but unnecessary for P9A if the surface lives only on authenticated `/account`.

---

## I. Claim transaction lifecycle

```text
load entitlements (GET /api/account/holder-rewards)
  → require authenticated_match + external wallet + chainId === 4663
  → for each row: read round(roundId, asset) + isPaid(...)
  → if published && !isPaid && proof present → Claimable
  → on Claim:
       verify wallet === entitlement.account_address
       verify chain 4663
       optional: verifyMerkleProof(proof, onChainRoot, leaf)
       simulateContract claim(roundId, asset, account, amount, proof)
       live-account recheck
       writeContract
       waitForTransactionReceipt
       verify HolderRewardClaimed (roundId, asset, account, amount)
       refresh isPaid + entitlement list UI
```

### Reusable helpers per step

| Step | Reuse |
|------|-------|
| Load entitlement | New API + `@scoop/db` list-by-account helper (new; worker today lists by vault/round) |
| Wallet match | `addressesEqual` / `sessionAddress`; `ClaimAccountChangedError` pattern |
| Chain | Launch/trade `ROBINHOOD_CHAIN_ID` + `useSwitchChain` |
| Vault + round | New reads using `scoopAbis.ScoopHolderRewards` (mirror worker `chain.ts`) |
| Simulate / write / receipt | Clone `executeWalletCreatorClaim` structure |
| Explorer | `robinhoodTxUrl` |
| Phases / row UX | `ClaimRowPhase` + CreatorClaimsLane layout |
| Embedded block | `resolveOnChainWalletCapability` / `sessionOnly` gate |

### Missing helpers P9A will need

1. `listHolderRewardEntitlementsForAccount(pool, { chainId, account })` in `@scoop/db` (join worker rounds for publish metadata).
2. `apps/web/src/lib/holder-rewards/execute-claim.ts` (or under `lib/claims/holder-*.ts`) — simulate/write/verify `HolderRewardClaimed`.
3. `read-holder-reward-state.ts` — batch `isPaid` + `round` reads.
4. Optional ABI fragment file for web (or import `scoopAbis.ScoopHolderRewards` directly).
5. Schema/deployment feature gate helper so queries no-op on pre-P5 DBs.
6. Chain-id recheck inside the claim executor (gap vs creator claim).

---

## J. Historical / pre-migration compatibility

### Production constraints (from audit context + code)

- Canonical production protocol still undeployed.
- P5 and P8 migrations **not** applied to production Supabase.
- Holder rewards worker **not** on Render.
- No live holder root / canonical claims yet.
- Historical canary markets are test-only; **no silent fallback** from canonical to historical Factory (already enforced in launch/fee-keeper/worker configs).

### Breakage risks if P9 queries unconditionally

| Dependency | Pre-P5/P8 failure mode |
|------------|------------------------|
| `launches.holder_rewards_address` | Postgres undefined column (fee-keeper documents this; dual SQL exists) |
| `holder_reward_entitlements` / `holder_reward_worker_rounds` | Undefined relation |
| `listHolderRewardVaultMarkets` | Always SELECTs P5 columns — not mode-gated |

### Compatibility approach (aligned with fee-keeper)

Precedent: `packages/db/src/queries/fee-keeper.ts` — `deploymentMode: 'historical-test' | 'canonical-production'`; historical SQL **omits** P5 columns and maps null vault in memory.

For P9:

1. **Do not** import or call P5/P8-required SQL from `/account` load path unless mode/schema gate passes.
2. Feature flag / `holderRewardsUiEnabled` derived from env + schema check or deployment mode — default **off** on historical production.
3. When vault is null or entitlements empty → render nothing or a quiet empty state; never invent a global HolderRewards address.
4. Keep worker/canonical refusal of historical Factory fallback.
5. Token page: do not add `holder_rewards_address` to `getToken` until P5 is applied or dual SQL is in place.

This keeps the live historical site healthy while allowing canonical holder UX to activate only after deliberate migration + worker deployment + published rounds.

---

## K. Token-page integration opportunity

### Current architecture

```text
apps/web/src/app/token/[address]/page.tsx
  → loadTokenPage()
  → TokenMarketShell → TokenMarketLiveView
```

Fee MarketGroup today (`TokenMarketLiveView`): trading fee, creator share, creator earnings, protocol buyback.

`TokenDetail` / `getToken` (`packages/db/src/dto.ts`, `packages/db/src/queries/tokens.ts`) does **not** select `holder_rewards_address` or holders fee lifetime.

Launch-time holder copy lives in `EarningsStep.tsx` (`data-testid="holder-rewards-copy"`).

### Best later insertion points

1. **Market detail fee group** — “Holder rewards enabled” / vault / holders fee lifetime once `getToken` is mode-safe.
2. **Personal claim CTA** — link to `/account#holder-rewards` or inline claimable badge only when connected wallet has entitlements (do not overload first viewport chart/trade composition).
3. **Not** the holders balance API (`/api/tokens/[address]/holders`) — retail balances, not Merkle rounds.

Out of scope for P9A beyond noting the hook; implement account claim first.

---

## L. P9A implementation plan

Smallest sensible first slice: **Account Holder Rewards lane + entitlement API + on-chain claim** against ScoopHolderRewards, schema-gated.

### Files to create

| File | Purpose |
|------|---------|
| `apps/web/src/app/api/account/holder-rewards/route.ts` | SIWE-gated entitlement + proof fetch |
| `apps/web/src/lib/account/load-holder-rewards.ts` | Server loader + empty fallback when schema unavailable |
| `apps/web/src/components/account/HolderRewardsLane.tsx` | UI sibling to CreatorClaimsLane |
| `apps/web/src/lib/holder-rewards/types.ts` | Entitlement DTO + row phases |
| `apps/web/src/lib/holder-rewards/read-state.ts` | `isPaid` / `round` batch reads |
| `apps/web/src/lib/holder-rewards/execute-claim.ts` | simulate → write → receipt → `HolderRewardClaimed` |
| `apps/web/src/lib/holder-rewards/abi.ts` | Optional fragment or re-export `scoopAbis.ScoopHolderRewards` |
| `packages/db/src/queries/holder-rewards-account.ts` | `listEntitlementsForAccount` + join worker rounds |
| Tests: `*.test.ts` for loader gating, leaf/proof mapping, execute-claim verify | Unit tests |

### Files to modify

| File | Change |
|------|--------|
| `apps/web/src/components/account/AccountPageLive.tsx` | Mount `HolderRewardsLane` after Fees |
| `apps/web/src/components/account/AccountSignedOut.tsx` | Optional opener teaser |
| `packages/db/src/queries/index.ts` / `packages/db/src/index.ts` | Export new query |
| Possibly `apps/web/src/lib/account/load-account.ts` | Only if embedding summary counts; prefer separate endpoint for P9A |

### Tests to add

- DB query: lowercase account match; empty on missing tables/mode.
- Merkle: stored proof + `entitlement_raw` verifies against worker root helper.
- Execute claim: event verification; account-changed error; reject when `isPaid`.
- API: 401 without session; no secret leakage; empty payload when gated off.

### Explicitly out of scope for P9A

- Applying P5/P8 to production
- Deploying holder-rewards-worker to Render
- Publishing roots / running pushes
- Token-page redesign
- Changing FeesSection to a three-column layout
- Historical Factory fallback
- Updating `push_status` from the web app
- Realtime entitlements
- Embedded-wallet claim support

### Acceptance criteria

1. `/account` shows Holder Rewards section only when feature/schema gate allows; historical/pre-P8 returns empty without SQL errors.
2. Authenticated external wallet on Robinhood Chain sees Claimable rows only when on-chain `published && !isPaid` and proof present.
3. Claim tx uses vault from entitlement/launch, correct `claim` args, and verifies `HolderRewardClaimed`.
4. Pushed or previously claimed rows show Claimed/Pushed without offering Claim (`isPaid`).
5. Session-only / embedded / wallet-mismatch cannot broadcast.
6. No production DB/on-chain mutations from this phase of work beyond user-initiated claim in intentional test environments.

---

## M. Open questions / blockers

Only items that cannot be fully resolved from the repository:

1. **When will P5 + P8 be applied to the environment that serves production `/account`?** Until then P9A UI must ship gated-off. (Operational decision.)
2. **ETH asset sentinel for UI metadata:** contract exposes `NATIVE_ASSET()`; confirm product display treats that address as ETH the same way creator claims use `zeroAddress` — verify against deployed/canonical bytecode when canonical is live (ABI has the getter; web has no prior holder ETH display convention).
3. **Product preference for “Pushed” vs “Claimed” labels:** on-chain `isPaid` does not distinguish push vs claim; distinguishing requires indexer `holder_reward_payouts.payout_type` (P5) which may also be absent. Default recommendation: single **Paid** / **Claimed** label unless payout_type is available.

No unresolved questions about claim signature, proof format, `/account` mount point, or session-vs-wallet identity — those are determined by existing code.

---

## Evidence index (high-signal paths)

```text
apps/web/src/app/account/page.tsx
apps/web/src/components/account/AccountPageLive.tsx
apps/web/src/components/account/CreatorClaimsLane.tsx
apps/web/src/lib/claims/execute-claim.ts
apps/web/src/lib/account/load-account.ts
apps/web/src/lib/account/onchain-policy.ts
apps/web/src/lib/auth/session.ts
apps/web/src/lib/auth/reconciliation.ts
apps/web/src/lib/auth/address.ts
packages/contracts/src/abi/ScoopHolderRewards.json
packages/shared/src/holderRewardsMerkle.ts
packages/db/src/queries/holder-rewards-worker.ts
packages/db/src/queries/fee-keeper.ts
packages/db/src/repos/launches.ts
supabase/migrations/20260910210000_p5_canonical_fee_holder_state.sql
supabase/migrations/20260910220000_p8_holder_rewards_worker.sql
apps/holder-rewards-worker/src/chain.ts
```
