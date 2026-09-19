# Gate 1 — SCOOP → Ponsfamily V2 Launch Migration Current-State Audit

## 1. Verdict

`PASS — CURRENT STATE MAPPED; READY TO DESIGN MIGRATION`

Public launch, ScoopFactory write path, indexer handoff, `$TAPE` promotion surfaces, orange brand tokens, HoodLock CLI tooling, and historical-market assumptions are identified with concrete file paths. No Ponsfamily V2 integration exists in-repo; that absence is an external-input gap for later gates, not an unmapped launch path.

## 2. UTC timestamp

`2026-09-19T16:48:00Z`

## 3. Git state

| Field | Value |
|---|---|
| Repository root | `/Users/alexattinger/scoop-app` |
| Branch | `main` |
| HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` |
| Working tree | **Dirty** (pre-existing; not disturbed by this audit) |
| Dirty summary | 8 modified audit markdown files; ~90 untracked audit/report files + `apps/web/src/components/token/gate-min.test.tsx` |
| Production broadcasts | **None** (read-only audit) |

Pre-existing dirty state recorded; no stash/reset/clean/commit performed.

## 4. Current launch architecture

Public launch is a **full-page 4-step wizard** (not a modal) at `/launch`, with optional news-assisted entry at `/news/[providerArticleId]/launch` that session-handoffs into the same wizard.

```text
Home/Nav/Footer → /launch
  OR News → /news/{id}/launch (AI concepts) → session handoff → /launch

LaunchFlow (wallet shell gate)
  → LaunchFlowLive (Token → Market → Earnings & Buy → Review)
  → submitLaunch → runWalletLaunch (orchestrate.ts)
      pin IPFS → buildLaunchParams → fee/buy → ERC-20 approve(Factory)?
      → simulateContract → wallet writeContract → wait receipt
      → decode TokenLaunched (+ InitialBuyExecuted if launchAndBuy)
      → runLaunchCompletion (display bind + news + poll /api/launches/by-token)
  → MARKET LIVE when indexer row ready (or timeout / mismatch / retry)
```

**Top-level SCOOP write entry**

| Layer | Symbol | File |
|---|---|---|
| UI | `submitLaunch` | `apps/web/src/components/launch/LaunchFlowLive.tsx` |
| Orchestrator | `runWalletLaunch` | `apps/web/src/lib/launch/orchestrate.ts` |
| Prepare + simulate | `prepareAndSimulateLaunchWrite` | `apps/web/src/lib/launch/execute.ts` |
| **Broadcast** | `writeLaunchAfterSimulation` | `apps/web/src/lib/launch/execute.ts` |

Canonical Factory: `0x4B227d5E6199f42ceA4e638875fF8C740757DD3C` (`packages/contracts/src/manifests/canonical-production.json`).

Indexer (async): watches ScoopFactory `TokenLaunched` → `normalizeLaunch` → `launches` / `tokens` / pools.

## 5. Launch file map

| File | Role | SCOOP-specific? | Reuse for Pons? |
|---|---|---:|---:|
| `apps/web/src/app/launch/page.tsx` | `/launch` route; loads quote catalogue; mounts `LaunchFlow` | Partial (quote catalogue) | Yes (shell) |
| `apps/web/src/app/news/[providerArticleId]/launch/page.tsx` | News-assisted entry → concept flow | No | Yes |
| `apps/web/src/components/launch/LaunchFlow.tsx` | Wallet-runtime gate; dynamic-imports live flow | No | Yes |
| `apps/web/src/components/launch/LaunchFlowLive.tsx` | Wizard state, submit, completion, retries | Partial | Yes (shell); swap orchestrator |
| `apps/web/src/components/launch/LaunchProgress.tsx` | Step progress UI | No | Yes |
| `apps/web/src/components/launch/LaunchNav.tsx` | Back/Next | No | Yes |
| `apps/web/src/components/launch/steps/TokenStep.tsx` | Name, ticker, description, socials, image | No | Yes |
| `apps/web/src/components/launch/steps/MarketStep.tsx` | Quote catalogue picker | Yes (Scoop QuoteRegistry catalogue) | Maybe (if Pons quote model differs) |
| `apps/web/src/components/launch/steps/EarningsStep.tsx` | Creator destinations, additional fee, initial buy; Scoop copy | Yes (fee destinations) | Partial (buy amount UI) |
| `apps/web/src/components/launch/steps/ReviewStep.tsx` | Checklist, success/fail/retry; `launch`/`launchAndBuy` naming | Yes | Partial (shell) |
| `apps/web/src/components/launch/TokenImageUploader.tsx` | Upload + AI artwork UI | No | Yes |
| `apps/web/src/lib/launch/state.ts` | Form/step reducer | No | Yes |
| `apps/web/src/lib/launch/types.ts` | Form model, fee defaults, step IDs | Yes (fee constants) | Partial |
| `apps/web/src/lib/launch/validation.ts` | Per-step validation | Partial | Yes (pattern) |
| `apps/web/src/lib/launch/tx-state.ts` | Tx/completion phase machine | Partial (`functionName`) | Yes (generalize) |
| `apps/web/src/lib/launch/orchestrate.ts` | Client pipeline pin→approve→sim→write→decode | Yes | Replace write/decode; keep phases |
| `apps/web/src/lib/launch/execute.ts` | ScoopFactory prepare/sim/write | Yes | Replace with Pons adapter |
| `apps/web/src/lib/launch/factory-abi.ts` | Minimal Factory ABI | Yes | Replace |
| `apps/web/src/lib/launch/build-launch-params.ts` | Form → Scoop `LaunchParams` | Yes | Replace |
| `apps/web/src/lib/launch/dev-buy.ts` | `launch` vs `launchAndBuy`, amount parse, slippage | Yes | Partial (parse/slippage) |
| `apps/web/src/lib/launch/erc20-funding.ts` | Balance/allowance; approve Factory | Yes (spender) | Pattern reuse; new spender |
| `apps/web/src/lib/launch/decode-launch.ts` | `TokenLaunched` / `InitialBuyExecuted` | Yes | Replace |
| `apps/web/src/lib/launch/creator-id.ts` | Scoop `creatorId` bytes32 | Yes | Unknown (external) |
| `apps/web/src/lib/launch/creator-recipient.ts` | Creator destination modes | Yes | Unknown |
| `apps/web/src/lib/launch/salt.ts` | CREATE2 salt | Yes | Unknown |
| `apps/web/src/lib/launch/protocol-metadata.ts` | On-chain metadata limits | Partial | Update if Pons differs |
| `apps/web/src/lib/launch/ensure-ipfs.ts` | Client pin-once | No | Yes |
| `apps/web/src/lib/launch/complete-launch.ts` | Post-receipt display/news/index wait | Partial | Partial (needs Pons index or alternate live) |
| `apps/web/src/lib/launch/wait-for-indexed-launch.ts` | Poll until DB ready | Yes (Scoop row shape) | Needs Pons indexer or new readiness |
| `apps/web/src/lib/launch/verify-indexed-launch.ts` | Receipt vs DB checks | Yes | Update |
| `apps/web/src/lib/launch/pending-completion.ts` | Resume post-receipt work | Partial | Yes (extend for HoodLock) |
| `apps/web/src/lib/launch/fresh-launch-handoff.ts` | sessionStorage token-page handoff | No | Yes |
| `apps/web/src/lib/launch/bind-token-display-image.ts` | Bind artwork to token | No | Yes |
| `apps/web/src/lib/launch/finalize-token-display-image.ts` | Durable image finalization | No | Yes |
| `apps/web/src/app/api/launches/by-token/route.ts` | Indexed readiness poll | Yes | Needs Pons rows or alternate |
| `apps/web/src/app/api/launch/artwork/pin/route.ts` | Pinata pin | No | Yes |
| `apps/web/src/app/api/launch/display-image/*` | Display bind/enqueue/serve | No | Yes |
| `apps/web/src/components/launch-assist/*` | News AI concepts/artwork | No | Yes |
| `apps/web/src/app/api/launch-assist/*` | Assist API | No | Yes |
| `apps/indexer/src/live/processBlock.ts` | Discovers Factory launches | Yes | Extend or parallel path |
| `apps/indexer/src/live/normalizeLaunch.ts` | Upserts Scoop launch shape | Yes | New projection for Pons |
| `apps/indexer/src/live/decode.ts` | Scoop event decode | Yes | Extend |
| `packages/contracts/src/manifests/canonical-production.json` | Canonical Scoop addresses | Yes | Add Pons manifest later |
| `packages/shared/src/launchFeeEconomics.ts` | Scoop fee split math | Yes | Historical only |
| `packages/contracts/src/fees.ts` | `BASE_FEE`, `TICK_SPACING` | Yes | Historical / UV4 |

**Launch-path file count (web):** ~54 under `apps/web/src/lib/launch/` + ~13 under `apps/web/src/components/launch/` + assist/API/indexer supporting files ≈ **70+** identified launch-path files.

## 6. Old-protocol dependencies

### Remove / bypass for **new** launches

- ScoopFactory write: `execute.ts`, `orchestrate.ts`, `factory-abi.ts`, `dev-buy.ts` `selectLaunchFunction`
- Canonical Factory address + Scoop `LaunchParams` (`build-launch-params.ts`)
- Fee UI constants: `LAUNCH_FEE_WEI`, additional fee / creator destinations / `PROTOCOL_FEE_SPLIT`
- ERC-20 approve spender = ScoopFactory (`erc20-funding.ts`)
- Event decode: Scoop `TokenLaunched` / `InitialBuyExecuted` (`decode-launch.ts`)
- Post-launch readiness that assumes Scoop indexer rows (`wait-for-indexed-launch`, `/api/launches/by-token`)
- Public exposure of Scoop protocol launch as the only write path

### Retain for **historical** SCOOP markets

- Historical factory `0x15E874Bc667435ddbF2a67c0362701DC23C90833` + dual TokenLaunched topics
- Manifests / ABIs under `packages/contracts`
- Indexer Scoop decode + HELLO/canary paths
- Fee-keeper / holder-rewards workers / claims UI for past markets
- Existing DB rows (`launches`, `tokens`, fee/holder tables)
- Trade path for UV4 pools already indexed from Scoop launches

### Generic / reusable

- Wizard shell (steps, nav, progress, validation patterns)
- Wallet / Reown / wagmi signing
- Image upload, IPFS/Pinata, display storage
- AI launch-assist concepts/artwork
- Tx phase machine pattern (`tx-state.ts`) — generalize names
- sessionStorage handoffs / fresh-launch gate
- Quote catalogue **concept** (may need different data source for Pons)
- Discovery / markets / token read APIs (if Pons rows land in same schema)

## 7. `$TAPE` surfacing map

Documented live token address appears in ops audits only (`0x5d7493…`); **not** hardcoded in `apps/web`. Official address for `/protocol/tape` comes from DB `protocol_settings.tape_official_contract`.

| Occurrence | Location | Classification |
|---|---|---|
| Dedicated protocol page | `apps/web/src/app/protocol/tape/page.tsx` | **Safe to de-surface from public UI** |
| Contract card | `apps/web/src/components/protocol/TapeContractCard.tsx` | **Safe to de-surface from public UI** |
| Live stats shell | `apps/web/src/components/protocol/ProtocolStatsLive.tsx` | **Safe to de-surface from public UI** |
| Footer link `$TAPE` → `/protocol/tape` | `apps/web/src/components/shell/SiteFooter.tsx` | **Safe to de-surface from public UI** |
| Homepage announcement → `/protocol/tape` | `apps/web/src/lib/announcements.ts` + `AnnouncementBar` | **Safe to de-surface from public UI** |
| Page SEO/OG for `/protocol/tape` | tape `page.tsx` metadata | **Safe to de-surface from public UI** |
| Protocol stats API | `apps/web/src/app/api/protocol/stats/route.ts` | **Unknown — needs decision** |
| Stats loader / DB aggregates | `lib/protocol/load-stats.ts`, `packages/db/.../protocol-stats.ts` | **Historical route/data should remain** (or API decision) |
| Brand constants (mostly unused) | `apps/web/src/lib/protocol/tape.ts` | **Safe to de-surface from public UI** |
| Organic markets/discovery if indexed | discover/markets/token routes | **Historical route/data should remain** |
| Operator CLIs / TGE scripts | `scripts/tape-*`, `scripts/tge-*` | **Historical route/data should remain** |
| DB setting + migration | `protocol_settings`, migrations | **Historical route/data should remain** |
| Primary nav | No `$TAPE` item | N/A |
| Docs (`scoop-protocol-docs.md`) | No `$TAPE` mention | N/A |

**Not pinned** in markets/discovery feeds. Organic listing possible if indexed and not a hidden canary.

## 8. Brand colour map

### Source of truth

| Layer | Path | Value |
|---|---|---|
| CSS canonical | `apps/web/src/app/globals.css` | `--scoop-orange: #fc4c00`; `--color-scoop: var(--scoop-orange)` |
| TS constant | `apps/web/src/lib/brand.ts` | `SCOOP_ORANGE = '#FC4C00'` |
| Brand-lock test | `apps/web/src/lib/discovery/tabs.test.ts` | Asserts `#FC4C00` |

~46 files use `var(--scoop-orange)` (CTAs, nav active, tabs, badges, launch progress, protocol gradients, etc.).

### Hardcoded orange **not** covered by CSS token alone

| File | Usage |
|---|---|
| `apps/web/src/app/layout.tsx` | `themeColor: '#FC4C00'` |
| `apps/web/src/components/auth/WalletRuntimeProviders.tsx` | Reown `'--w3m-accent': '#FC4C00'` |
| `apps/web/src/app/token/[address]/opengraph-image.tsx` | `#FC4C00` (OG cannot use CSS vars) |
| `apps/web/public/brand/*` raster assets | Baked orange in PNGs/JPGs |
| `apps/web/public/README.md` | Documents `#FC4C00` |

### Minimal migration path to `#015225`

1. Change `--scoop-orange` in `globals.css` (re-evaluate `--scoop-orange-contrast` for dark green).
2. Align `SCOOP_ORANGE` in `brand.ts` + brand-lock test.
3. Update `themeColor`, Reown accent, OG image hexes.
4. Separate asset pass for brand PNGs/JPGs.

Do **not** change colours in this gate.

## 9. Pons V2 readiness

### Existing integration found

**None.** Searches for `ponsfamily`, `PonsFamily`, `PonsV2`, bonding-curve launch packages, and Pons ABIs returned no product integration. The only “Pons” string in docs is a **quote-asset class label** in `scoop-protocol-docs.md` (Native / Scoop / Stock / Pons) — not a launch protocol.

### Reusable abstractions

- Wizard UI + form shell (steps 1–4)
- Wallet connection / signing
- Artwork + IPFS pipeline
- Generalized tx phase machine (`tx-state.ts`)
- Pending completion / fresh handoff patterns
- Dev-buy amount parsing + slippage helpers (semantics must be remapped)

### Missing external inputs required

- Ponsfamily V2 deployed addresses (chain 4663 or other)
- ABI(s) and function signatures (`launch`, launch+buy if any, views)
- Events yielding **token address** and **actual tokens received**
- Fee / `msg.value` / approval spender rules
- Whether buy is atomic with launch
- Indexing / market-display requirements for Pons tokens

### Likely implementation files

| Concern | Location |
|---|---|
| ABI + address manifest | `packages/contracts` (new Pons artifacts; do not overload ScoopFactory) |
| Adapter | `apps/web/src/lib/launch/adapters/pons/` (prepare/sim/decode/funding) |
| Orchestrator seam | `orchestrate.ts` behind `LaunchProtocolAdapter` |
| UI copy / checklist | `EarningsStep`, `ReviewStep`, `tx-state` checklist types |
| Indexer (if markets should appear) | parallel discovery in `apps/indexer` + `market_source` / factory allowlist |

**Replace:** ScoopFactory write/decode path — not the wizard shell.

## 10. Dev-buy readiness

### Current behaviour

| Concern | Behaviour |
|---|---|
| Amount | Form `devBuyAmount`; empty/0 → `launch` only |
| Atomicity | Single ScoopFactory `launchAndBuy(params, quoteAmountIn, minTokensOut)` |
| ETH / quote | Native: `msg.value = LAUNCH_FEE + quoteIn`; ERC-20: fee in ETH + approve Factory |
| Slippage | Fixed 1% (`LAUNCH_DEV_BUY_SLIPPAGE_BPS`); not user-editable in launch UI |
| Min out | Probe sim (`minTokensOut=1`) → `tokensBought` → compute min → final sim |
| Balance | ERC-20 balance check; native relies on wallet |
| Receipt | Requires `InitialBuyExecuted`; stores `tokensOut` |
| UI copy | Explicitly names `launchAndBuy` / Factory |

### Migration gaps

- Entire function selection and spender are Scoop-specific.
- Naming (`launchAndBuy`, Factory) will mislead once Pons is used — prefer neutral “Initial buy” / adapter method names.
- New system must lock **actual tokens received** (receipt/event), not simulation estimate — current Scoop path already prefers event `tokensOut`; preserve that invariant for Pons events.
- Pons event shape for tokens received is an **external input**.

### Reusable

- Human amount parse, soft ETH typo guard, slippage helper, `approving_quote` phase pattern, balance/allowance read pattern.

## 11. HoodLock readiness

| Item | Status |
|---|---|
| ABI | Fragment in `scripts/lib/hoodlock.mjs` (`lock`, `locks`, `Locked`, `fee`, …) — **not** under `packages/contracts` |
| Address | `0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F` (`scripts/lib/tge-constants.mjs`) |
| Policy | **6 calendar months** (`TGE_DEV_BUY_LOCK_CALENDAR_MONTHS`) via `scripts/lib/tge-unlock-policy.mjs` |
| Create / verify | CLI: `tge-mutation.mjs`, `tape-verify-lock.mjs` / `tge-verify-lock.mjs` |
| Browser / `apps/web` | **No references** — CLI-only today |
| Approval | Exact ERC-20 `approve(HoodLock, amount)` for **actual tokensOut**; unlimited rejected in TGE design |
| Recovery pattern | `tge-failure-report.mjs` — classify lock certainty, manual takeover params, verify before second lock |

### Gaps for public launch

- No wagmi/browser HoodLock path.
- Allocation detection today assumes Scoop `InitialBuyExecuted` (`tge-dev-allocation.mjs`).
- Must persist durable IDs across launch → approve → lock → verify (token, amount, owner, tx hashes, lock id).
- If Pons launch+buy succeed but HoodLock fails: **never relaunch**; resume from stored token + actual amount (CLI playbook exists; product UI needed).

## 12. Proposed state machine

Smallest robust frontend machine (idempotent; relaunch forbidden after Pons success):

```text
draft
  → review
  → preflight
  → wallet_request_pons
  → pons_launch_buy_submitted        # durable: txHash
  → pons_launch_buy_confirmed         # durable: receipt
  → token_address_resolved            # durable: token
  → actual_dev_amount_resolved        # durable: tokensOut (event/balance proof)
  → hoodlock_approval_required
  → hoodlock_approval_submitted
  → hoodlock_approval_confirmed
  → hoodlock_lock_submitted
  → hoodlock_lock_confirmed           # durable: lockId, unlockTime
  → lock_verification
  → complete
  ↔ recoverable_failure               # never clears token/txHash once set
```

### Durable identifiers to retain (resume-safe)

| ID | Purpose |
|---|---|
| `ponsTxHash` | Prove launch already broadcast; block relaunch |
| `tokenAddress` | Resume approve/lock without re-deploy |
| `devTokensOut` (raw) | Exact lock amount — never re-estimate |
| `owner` / connected wallet | Approval + lock beneficiary |
| `quoteAsset` / chainId | Context for funding/UI |
| `hoodlockApprovalTxHash` | Skip re-approve if confirmed |
| `hoodlockLockTxHash` / `lockId` | Skip re-lock; feed verify |
| `unlockTime` | Policy proof |

Persist via extended `pending-completion` / sessionStorage (+ optional server draft later). UI after `token_address_resolved` must offer **Resume lock** / **Verify**, not **Launch again**.

## 13. Historical compatibility risks

### Can display both (if indexed into same schema)

- `/token/[address]` read path, charts, trades lists
- `/markets`, homepage discovery, rankings APIs
- Quote display resolution
- UV4 swap UI **if** Pons still produces compatible pool keys + same router/hooks

### Assume every market is Scoop

- Public launch write path (Factory-only)
- Indexer discovery (single ScoopFactory)
- Hydrate via `ScoopToken` / `ScoopFactory.getLaunch`
- Fee-split / claims / fee-keeper / holder-rewards
- Bonding progress / tick-range “soon” UX
- Copy: “No SCOOP market…”

### Discriminator probably required

- Indexer multi-factory + ABI branch
- Expose `factoryAddress` / `market_source` on public DTOs
- Fee/claims UI gated by source
- Trade address allowlists if Pons uses different infrastructure
- Launch route cutover: public Scoop launch off; historical markets remain viewable

**Desired direction matches repo evidence:** new launches → Pons V2; historical Scoop remain viewable where indexed; public Scoop launch eventually removed.

## 14. Test impact

### Existing (selected)

| Suite | Disposition |
|---|---|
| `execute.test.ts`, `build-launch-params.test.ts` | Keep as **Scoop legacy**; parallel Pons suites |
| `dev-buy.test.ts`, `erc20-funding.test.ts` | **Update** or fork for new spender/method |
| Image/IPFS/handoff/no-forced-redirect tests | **Retain** |
| `complete-launch` / `verify-indexed` / `wait-for-indexed` | **Update** for Pons readiness |
| `pending-completion` / `completion-panel-copy` | **Supplement** (HoodLock resume, relaunch ban) |
| `LaunchFlow` / `ReviewStep` / `EarningsStep` UI tests | **Update** |
| `orchestrate.ts` | **No dedicated tests today** — **new** suite required |
| `scripts/tge-verify-lock.test.ts`, finalize phase tests | **Retain** + reuse for 6-month policy |
| `AnnouncementBar` / `SiteFooter` / tape stats tests | **Update** for `$TAPE` de-surface |
| `tabs.test.ts` brand lock | **Replace** `#FC4C00` → `#015225` when theme gate runs |

### Minimum new coverage

- Pons preflight (chain, addresses, funding, Scoop public write disabled)
- Launch+dev-buy calldata construction
- Receipt parsing → token + **actual** tokensOut
- HoodLock approve / lock / 6-month unlock calc / verify
- Partial failure recovery + relaunch prevention
- `$TAPE` de-surfacing assertions
- Theme token migration assertions

## 15. Recommended implementation gates

Evidence supports the proposed order with one adjustment: lock external Pons + HoodLock browser inputs first; adapt before UI cutover; de-surface `$TAPE` and theme after launch path is stable.

1. **Gate 2** — Lock external inputs: Pons V2 ABI/addresses/events/fees; confirm HoodLock browser packaging (promote fragment ABI into `packages/contracts`); freeze 6-month unlock policy reuse from `tge-unlock-policy.mjs`.
2. **Gate 3** — Pons adapter + simulation (no public cutover); `LaunchProtocolAdapter` seam in `orchestrate.ts`.
3. **Gate 4** — Launch+dev-buy state + receipt decode + durable pending-completion IDs; relaunch prevention.
4. **Gate 5** — HoodLock approve + 6-month lock + verify in browser; recovery UX for post-launch lock failure.
5. **Gate 6** — Indexer / `market_source` (or factory allowlist) so Pons markets can go live in product surfaces **or** explicit “live without Scoop index” product decision.
6. **Gate 7** — De-surface `$TAPE` public promotion (footer, announcement, `/protocol/tape` entry points).
7. **Gate 8** — Orange → `#015225` (CSS + TS + theme-color + Reown + OG + assets).
8. **Gate 9** — Historical compatibility cleanup (hide Scoop public launch; keep Scoop read/claims for legacy).
9. **Gate 10** — End-to-end production readiness (canary launch, lock verify, no relaunch, markets visibility).

Adjustment vs the brief: **indexer/market-source (Gate 6)** before or with final readiness, because without it “MARKET LIVE” will timeout under current Scoop-only indexing.

## 16. Explicit no-change confirmation

| Check | Result |
|---|---|
| application code changed | **NO** |
| configuration changed | **NO** |
| env changed | **NO** |
| production transaction broadcast | **NO** |
| deployment performed | **NO** |
| commit created | **NO** |
| push performed | **NO** |

---

*Gate 1 complete. Working tree left exactly as found (dirty). Report only artifact added: this file.*
