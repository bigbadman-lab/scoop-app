# Gate 2 — Lock Ponsfamily V2 + HoodLock Integration Inputs

## 1. Verdict

`PASS — EXTERNAL INPUTS LOCKED; READY FOR PONS ADAPTER IMPLEMENTATION`

On-chain bytecode, Factory/LaunchAndBuy reads, live LaunchAndBuy receipt decoding, HoodLock locker reads, and official docs (Pons V2 + HoodLock contracts) are sufficient to design the adapter. Public cutover feasibility is separately classified below.

## 2. Public-launch feasibility

# `PUBLIC_LAUNCH_READY`

**On-chain evidence (authoritative for this gate), chain 4663, block ~67241774 @ `2026-09-19T16:55:57Z`:**

| Read | Result |
|---|---|
| `launchEnabled()` | `true` |
| `canLaunch(0x1111…1111)` (arbitrary EOA) | `true` |
| `canLaunch(LaunchAndBuy router)` | `true` |
| `whitelistedLaunchers(sample EOA)` | `false` |
| Recent Factory `TokenLaunched` volume | **6,622** in last ~500k blocks |
| Native ETH share of those launches | **~78.9%** |

**Docs discrepancy (reported, not silently ignored):**

- `https://docs.ponsfamily.com/llms.txt` and the end of `https://docs.ponsfamily.com/v2` still say: *“Public launching is closed… only whitelisted addresses can create a token.”*
- Live chain state contradicts that: the public gate is open; whitelist is not required for arbitrary EOAs today.

**Implication:** Adapter implementation **and** production public cutover of SCOOP creator wallets are **not** blocked by a whitelist gate **as of this verification**. Re-check `canLaunch(connectedWallet)` immediately before every launch (and before offering Create) — the owner can close the gate again.

LaunchAndBuy does **not** bypass the Factory gate (docs + router `factory()` → same Factory). It authenticates the **initiating wallet** via the Factory trusted-forwarder path: observed `TokenLaunched.deployer == tx.from`, while `CurveBuy.buyer == LaunchAndBuy router` and `CurveBuy.recipient == tx.from`.

No documented integrator/forwarder that would let SCOOP users launch without themselves passing `canLaunch`. None required while the public gate remains open.

## 3. UTC timestamp

`2026-09-19T16:57:12Z`

## 4. Git state

| Field | Value |
|---|---|
| Repository root | `/Users/alexattinger/scoop-app` |
| Branch | `main` |
| HEAD | `56cbaf666b48f41d3c2af153a40688f517dd8768` (unchanged from Gate 1) |
| Working tree | **Dirty** (pre-existing; undisturbed) |
| Dirty count | ~99 modified/untracked paths |
| Production broadcasts | **None** |

## 5. Verified Pons V2 addresses

RPC: `https://rpc.mainnet.chain.robinhood.com` (read-only). Sources: official docs (`docs.ponsfamily.com/v2`, `llms.txt`) + Gate 2 input list + on-chain `eth_getCode`.

| Contract | Address | Bytecode verified? | Source |
|---|---|---:|---|
| Factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` | **Yes** (24177 bytes) | Docs + input + chain |
| Meme hook | `0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044` | **Yes** | Docs + input + chain |
| Fee escrow | `0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e` | **Yes** | Docs + input + chain |
| Buyback vault | `0x42df2a798f82289E177311362e8f5ccC45c1219c` | **Yes** | Docs + input + chain |
| Launch locker | `0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952` | **Yes** | Docs + input + chain |
| **LaunchAndBuy router** | `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948` | **Yes** (4416 bytes) | Docs + input + chain |
| Launch deployer | `0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42` | **Yes** | Docs + input + chain |
| Graduation executor | `0xC7819B64A1dAECD7eC19856d026cb14EfBd89046` | **Yes** | Docs + input + chain |
| Graduation guard | `0xf5695117b99B6f6401e67d4195BD653628176C6C` | **Yes** | Docs + input + chain |

`LaunchAndBuy.factory()` → `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` (matches Factory).

## 6. Verified Pons ABI surface

Minimal ABI SCOOP needs (from official V2 docs; LaunchAndBuy receipts confirm event usage):

```solidity
// --- Factory ---
function canLaunch(address) view returns (bool);
function launchEnabled() view returns (bool);
function launchFee() view returns (uint256);
function maxCreatorTaxBps() view returns (uint16);
function launchConfigCount() view returns (uint256);
function getLaunchConfig(uint256 id) view returns (
  uint256 supply,
  uint256 curveFeeBps,
  uint256 phantomQuote,
  uint256 graduationThreshold,
  uint24 poolFee,
  int24 tickSpacing,
  bool enabled
);
function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32);
function approvedPairTokens(address pairToken) view returns (bool);
function pairTokenEconomics(address pairToken) view returns (
  uint256 phantomQuote,
  uint256 graduationThreshold,
  uint8 decimals
);
function getLaunchedToken(address token) view returns (/* LaunchedToken struct */);

event TokenLaunched(
  address indexed token,
  address indexed curve,
  address indexed deployer,
  address pairToken,
  uint256 launchConfigId,
  uint256 graduationThreshold
);

// --- LaunchAndBuy router ---
struct Socials {
  string twitter;
  string telegram;
  string discord;
  string website;
  string farcaster;
}
struct TokenParams {
  string name;
  string symbol;
  string logo;
  string description;
  Socials socials;
  address creatorFeeRecipient; // MUST be non-zero for LaunchAndBuy
  uint16 creatorTaxBps;
  bool buybackEnabled;
  bytes32 expectedEconomics;
  bytes32 salt;
}
function launchAndBuy(
  TokenParams params,
  uint256 launchConfigId,
  address pairToken,
  uint256 quoteIn,
  uint256 minTokensOut,
  address recipient,
  address[] snipeTaxExemptions
) payable returns (address token, address curve, uint256 tokensOut);

function factory() view returns (address);

// --- Curve (post-launch / decode) ---
event CurveBuy(
  address indexed buyer,
  address indexed recipient,
  uint256 quoteIn,
  uint256 tokensOut,
  uint256 fee,
  uint256 tax
);
event CurveBuyRefunded(address indexed buyer, address indexed recipient, uint256 quoteRefunded);
event CurveSell(
  address indexed seller,
  address indexed recipient,
  uint256 tokensIn,
  uint256 quoteOut,
  uint256 fee,
  uint256 tax
);
```

Relevant custom errors (docs): `NotWhitelisted`, `LaunchFeeNotPaid`, `LaunchEconomicsMismatch`, `PairTokenNotApproved`, `CreatorTaxTooHigh`, `SlippageExceeded`, `NativeValueMismatch`, `UnexpectedNativeValue`.

## 7. Launch gate findings

- Prefer `canLaunch(address)` over composing `launchEnabled()` + `whitelistedLaunchers(address)` (docs).
- **Current state:** public gate open (`launchEnabled=true`, arbitrary `canLaunch=true`).
- LaunchAndBuy holds callers to the same gate; router is not a privilege escalator.
- Initiating creator wallet is preserved as `TokenLaunched.deployer` / CREATE2 namespace owner (observed on live LaunchAndBuy txs).
- Docs claiming “closed” are **stale** relative to chain; treat as ops risk to re-verify, not as current blocker.

## 8. Launch configuration

### Config `0`

| Field | On-chain value |
|---|---|
| `launchConfigCount()` | `1` (only id `0`) |
| `getLaunchConfig(0).enabled` | **`true`** |
| `supply` | `1e27` (1e9 tokens × 1e18) |
| `curveFeeBps` | `100` (1%) |
| `phantomQuote` | `1.68 ETH` |
| `graduationThreshold` | `4.2 ETH` |
| `poolFee` | `0` |
| `tickSpacing` | `200` |

**Config `0` is valid/usable for new launches.**

### Launch fee

`launchFee()` = **`500000000000000` wei = 0.0005 ETH** (live). Re-read immediately before building `msg.value`.

### Economics pin

`previewLaunchEconomics(0, address(0))` =
`0xa9fc75d4203a33fe660e8fa32c74c3aa41c1fda4bf23d3a39b6bc22a1f8b1ca7`

Must be fetched **immediately before** simulate/launch and passed as `expectedEconomics` (not a constant).

### Max creator tax

`maxCreatorTaxBps()` = **`1000`** (10%).

### Quote assets

**Critical nuance:** `approvedPairTokens(address(0))` returns **`false`**, and `pairTokenEconomics(address(0))` returns zeros — yet native ETH launches dominate production (~79%). Docs’ `usableQuoteAssets` snippet that requires `approvedPairTokens` for every asset is **incomplete for native ETH**. Native ETH is driven by launch-config phantom/threshold fields, not the ERC-20 pair-economics table.

Approved ERC-20 pairs observed in recent launches (examples):

| Address | Symbol | Decimals | `approvedPairTokens` |
|---|---|---:|---|
| `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | USDG | 6 | true |
| `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | NVDA | 18 | true |
| `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | SPCX | 18 | true |
| `0x12f190a9F9d7D37a250758b26824B97CE941bF54` | AMZN | 18 | true |
| `0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4` | cbBTC | 8 | true |

### Smallest SCOOP v1 launch surface (recommendation)

**Native ETH only (`pairToken = address(0)`, `launchConfigId = 0`).**

Do **not** carry SCOOP’s stock/USDG catalogue into the first Pons cutover. ERC-20 pairs remain available later behind `approvedPairTokens` + `pairTokenEconomics` checks and router ERC-20 approve flow.

### Buyback setting

`buybackEnabled` is a Pons launch flag: when true, a slice of the **Pons** base trading fee funds Pons’ five-year buyback vault for that token. It is **not** SCOOP’s legacy protocol buyback/fee-keeper machinery. Product options: default `true` (docs examples), default `false`, or expose a toggle — **decision deferred**; adapter must accept the bool.

## 9. SCOOP → Pons field mapping

| Pons `TokenParams` field | Classification | Mapping notes |
|---|---|---|
| `name` | Direct reuse | SCOOP `name` |
| `symbol` | Direct reuse | SCOOP `ticker` |
| `logo` | Direct reuse | SCOOP IPFS `ipfs://…` after pin |
| `description` | Direct reuse | SCOOP `description` (verify Pons length limits in Gate 3) |
| `socials.twitter` | Direct reuse | SCOOP `twitter` |
| `socials.telegram` | Direct reuse | SCOOP `telegram` |
| `socials.website` | Direct reuse | SCOOP `website` |
| `socials.discord` | Requires new UI **or** omit (empty string) | Not in current SCOOP form |
| `socials.farcaster` | Omit from visible UI; populate `""` | Not in current SCOOP form |
| `creatorFeeRecipient` | Fixed by SCOOP policy (recommended) | LaunchAndBuy **rejects zero**. Default = connected creator wallet. Optional later: custom recipient UI (maps loosely to old creator-destination concepts). |
| `creatorTaxBps` | Unresolved product decision | Cap = 1000. Options: (a) fix `0`, (b) fix SCOOP-chosen bps, (c) expose slider 0–max. Current SCOOP “additional fee” is **not** the same mechanism. |
| `buybackEnabled` | Unresolved product decision | Pons fee-split buyback; not Scoop buyback vault. |
| `expectedEconomics` | Generated automatically | Live `previewLaunchEconomics` immediately pre-sim |
| `salt` | Generated automatically | Fresh 32-byte random; **persist before submit** so retries reuse the same salt/CREATE2 addresses |

**Drop for Pons path (Scoop-only):** `additionalFee`, Scoop fee destinations, Scoop `creatorId` bytes32, Factory approve-as-spender, Scoop QuoteRegistry catalogue (v1).

## 10. Atomic launch+dev-buy design

### Requirement

Every SCOOP launch uses **LaunchAndBuy** with a non-zero creator/dev buy.

### Native ETH `msg.value`

```text
msg.value = launchFee() + quoteIn
```

Confirmed live:

| Tx | `msg.value` | CurveBuy `quoteIn` | Implied fee |
|---|---|---|---|
| `0x10ada643…` | 0.0455 ETH | 0.045 ETH | 0.0005 ETH |
| `0xcb5ee843…` | 0.00080096 ETH | 0.00030096 ETH | 0.0005 ETH |
| `0x22536b6a…` | 0.07215123561 ETH | 0.07165123561 ETH | 0.0005 ETH |

ERC-20 pair (later): `msg.value = launchFee` only; `approve(LaunchAndBuy, quoteIn)` first.

### `quoteIn`

For `pairToken = address(0)`, denominated in **wei of native ETH**. Must equal the buy portion of `msg.value`.

### `minTokensOut`

No on-curve quote view exists before the curve is created. Safest path:

1. Build params with fresh `expectedEconomics` + salt.
2. `simulateContract` LaunchAndBuy → read returned `tokensOut`.
3. Set `minTokensOut` from simulated rate/amount with slippage (see §11).
4. Docs: `minTokensOut` enforces **price/rate**, not absolute fill size; clamped fills that honour the rate can succeed; unspent quote may refund (`CurveBuyRefunded`).

### Recipient / snipe tax

- Set `recipient` = connected creator wallet (tokens land there for HoodLock).
- Router auto-exempts `recipient` from opening snipe tax; pass `snipeTaxExemptions = []` for solo creators.
- Observed: `CurveBuy.buyer = router`, `CurveBuy.recipient = creator`.

### Actual dev-token amount (for HoodLock)

**Primary (strongest):** `launchAndBuy` return `tokensOut` from simulation **and** confirmed receipt decode:

1. Prefer decoded function return / success logs if available from receipt.
2. Else `CurveBuy` on the new curve where `recipient == creator` → use `tokensOut`.
3. Cross-check `TokenLaunched.token` / `.curve`.
4. Optional: `CurveBuyRefunded` if present → record refund; do **not** inflate lock amount.
5. Fallback only: post-tx `balanceOf(creator)` delta — unsafe if wallet already held the token (unlikely for brand-new CREATE2 token) or if other transfers occur in same block.

**Never** lock a pre-launch estimate.

## 11. Slippage strategy

| Concern | Recommendation |
|---|---|
| How to quote | Offline curve math from **config-0 initial reserves** (`phantomQuote`, `supply`, `curveFeeBps`, chosen `creatorTaxBps`, snipe=0 for recipient) **and/or** mandatory `simulateContract` |
| Default slippage | Do **not** blindly inherit Scoop’s 1%. Start with **simulate-derived `tokensOut` × (1 − bps)**; initial default **100 bps (1%)** is reasonable for atomic first buy (reserves deterministic) but make constant named `PONS_DEV_BUY_SLIPPAGE_BPS` and re-evaluate after canaries |
| Stale economics | Re-read `launchFee` + `previewLaunchEconomics` in the same preflight tick as simulation; on `LaunchEconomicsMismatch`, refresh and rebuild |
| `expectedEconomics` vs `minTokensOut` | Pin protects **launch config/terms**; `minTokensOut` protects **buy execution price/fill** |
| Partial fill / refund | Use actual `CurveBuy.tokensOut`; treat refunds as unused ETH returned — lock only tokens received |

## 12. Verified HoodLock inputs

| Item | Value |
|---|---|
| Locker address | `0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F` |
| Docs | `https://hoodlock.tech/docs/contracts` (checksum-equal) |
| Repo CLI constant | Matches Gate 1 / `scripts/lib/tge-constants.mjs` |
| Bytecode | **Yes** (4941 bytes) |
| Live `fee()` | **`5000000000000000` wei = 0.005 ETH** @ verification |
| Admin / collector | `0x79c1…CeA2` / `0xd599…6BBc` (matches HoodLock docs) |
| `totalLocks()` | 463 (sanity) |

### ABI (minimal)

```solidity
function fee() view returns (uint256);
function lock(address token, uint256 amount, uint256 unlockTime) payable returns (uint256 id);
function locks(uint256 id) view returns (
  address owner, address token, uint256 amount, uint256 unlockTime, bool withdrawn
);
function locksByOwner(address) view returns (uint256[]);
function locksByToken(address) view returns (uint256[]);
// docs also: getLock(id), lockedAmount(id), isUnlocked(id), extend, withdraw, …

event Locked(
  uint256 indexed id,
  address indexed owner,
  address indexed token,
  uint256 amount,
  uint256 unlockTime
);
```

Repo fragment in `scripts/lib/hoodlock.mjs` matches docs for `lock` / `Locked` / `fee` / `locks*`.

### Rules locked

- Approval: exact ERC-20 `approve(HoodLock, exactTokensOut)` before lock.
- `msg.value >= fee()`; **excess ETH refunded** (locker).
- **Do not hardcode fee** — read live `fee()` immediately before building lock tx.
- Unlock time is **extend-only**.
- Amount recorded = balance gained (fee-on-transfer safe); standard Pons ERC-20 expected OK.
- Verify via `Locked` event + `locks(id)` (owner/token/amount/unlockTime).

## 13. Six-calendar-month policy

Reuse **as-is** from:

- `scripts/lib/tge-unlock-policy.mjs`
- constants: `TGE_DEV_BUY_LOCK_CALENDAR_MONTHS = 6`, `TGE_UNLOCK_SAFETY_MARGIN_SECONDS = 300`
- tests: `scripts/tge-finalize.test.ts`, `scripts/tge-verify-lock.test.ts`

| Rule | Spec |
|---|---|
| Duration | 6 **calendar months**, not 180 days |
| Calendar math | UTC wall-clock; end-of-month clamp (`addCalendarMonthsUtc`) |
| Propose unlock | `addCalendarMonthsUtc(chainTimestamp, 6) + 300s` |
| Verify | `recordedUnlockTime >= addCalendarMonthsUtc(lockBlockTimestamp, 6)` (no margin on proof) |
| Promote to browser | Port pure helpers into `apps/web` (or shared package) — no CLI dependency |

## 14. HoodLock integration choice

**Recommend: direct verified-contract integration (wagmi/viem).**

| Criterion | Direct contract | REST API |
|---|---|---|
| Third-party availability | Only chain RPC | HoodLock API + chain |
| Verification | On-chain `Locked` / `locks(id)` | Same ultimately, extra hop |
| Calldata determinism | Full local control | Depends on API payload |
| Secrets/config | None (no API key) | Likely API key / partner config |
| Recovery | Matches existing TGE CLI playbook | Harder to reconcile |
| Stack fit | Already used in `scripts/lib/hoodlock.mjs` | New surface |

REST API may remain optional for partner fee-share / embed later; **not required** for SCOOP launch locks. No API key created in this gate.

## 15. Final wallet transaction sequence

Confirmed for **native ETH** Pons LaunchAndBuy + HoodLock:

```text
TX 1  LaunchAndBuy
        value = live launchFee + quoteIn
        → token, curve, tokensOut

WAIT / DECODE
        → tokenAddress, curveAddress, exact tokensOut
        → persist durable IDs (never relaunch)

TX 2  token.approve(HoodLock, exact tokensOut)

TX 3  HoodLock.lock(token, exact tokensOut, sixCalendarMonthUnlock)
        value = live HoodLock fee()

VERIFY
        → Locked event + locks(id)
```

**Wallet signature count: 3** (plus any chain-switch / connect). No documented multicall that safely combines these. ERC-20 quote path would add a **pre-TX1** approve to LaunchAndBuy (4 signatures) — out of v1 scope.

## 16. Durable recovery fields

| Field | When set | Purpose |
|---|---|---|
| `draftId` | draft | UI continuity |
| `salt` | preflight | CREATE2 stability across retries |
| `expectedEconomics` | preflight | rebuild/debug |
| `launchConfigId` / `pairToken` / `quoteIn` | preflight | context |
| `ponsTxHash` | immediately after TX1 broadcast | **blocks relaunch** |
| `tokenAddress` | after decode | resume lock |
| `curveAddress` | after decode | trade/index |
| `devTokensOut` (raw) | after decode | exact HoodLock amount |
| `recipient` / `owner` | at launch | approve/lock party |
| `hoodlockApprovalTxHash` | after TX2 | skip re-approve |
| `hoodlockLockTxHash` / `lockId` | after TX3 | skip duplicate lock |
| `unlockTime` | after TX3 | verify policy |
| `phase` | continuous | `LOCK_INCOMPLETE` vs `MARKET_LIVE` |

**Invariants (locked):**

1. After TX1 confirmed → never relaunch that draft.
2. Persist `ponsTxHash` immediately on broadcast.
3. Persist token + curve on decode.
4. Persist `devTokensOut` from receipt/event evidence.
5. Approve exact lock amount only.
6. Approval OK / lock fail → resume at lock.
7. Lock broadcast / UI lost → search receipt / `locksByOwner`+`locksByToken` before second lock.
8. Valid lock for intended allocation → never duplicate.
9. MARKET LIVE only after HoodLock verify (product rule for this migration).
10. On-chain Pons token may exist while UI shows `LOCK INCOMPLETE`.

## 17. Indexer requirements

Minimum Pons ingest for next indexer gate:

| Event / field | Use |
|---|---|
| Factory `TokenLaunched` | token, curve, deployer, pairToken, launchConfigId, graduationThreshold |
| Curve `CurveBuy` / `CurveSell` | tape / volume / last price |
| `CurveBuyRefunded` | correct spent quote |
| `LaunchSwept` / `PoolGraduated` / hook `PoolRegistered` | graduation state |
| `factory_address` / `market_source='pons_v2'` | discriminator |

### Schema honesty risks if forced into current Scoop rows

| Scoop assumption | Pons reality |
|---|---|
| UV4 pool at launch | Curve first; pool only after graduation |
| `feeDistributor` / `liquidityLocker` Scoop CREATE2 | Different (Pons escrow / launch locker / HoodLock separate) |
| Holder rewards address | Not Scoop holder-rewards |
| Scoop buyback vault / fee-keeper | Pons buyback vault + escrow |
| Factory = ScoopFactory | Must store Pons Factory |

**Smallest discriminator:** `market_source` enum (`scoop` \| `pons_v2`) **or** explicit `factory_address` allowlists exposed on public DTOs. Do not pretend Pons curve markets are Scoop UV4 pools until graduated + pool fields exist.

## 18. Open blockers

None that block **adapter implementation**.

Remaining non-blocking product/ops items:

1. Stale Pons docs (“public closed”) vs live open gate — monitor `canLaunch`.
2. Product decisions: `creatorTaxBps`, `buybackEnabled`, discord/farcaster fields.
3. Indexer/`market_source` required before Scoop-style “MARKET LIVE” discovery works for Pons tokens.
4. Pons metadata max lengths not exhaustively measured on-chain in this gate (use docs + simulate in Gate 3).
5. HoodLock REST API URL/schema not fetched (404 on guessed paths) — irrelevant given direct-contract choice.

## 19. Recommended Gate 3

**Implement:** Pons adapter + transaction simulation only (no public cutover).

Should include:

- `packages/contracts` Pons ABI fragments + address manifest
- `apps/web/src/lib/launch/adapters/pons/` prepare / simulate / decode
- Preflight: `canLaunch`, `launchFee`, `getLaunchConfig(0)`, `previewLaunchEconomics`, ETH balance
- LaunchAndBuy calldata builder for native ETH + mandatory simulate
- Receipt decode → token / curve / `tokensOut`
- Unit tests with fixtures from live receipt shapes (no broadcast)

**Must not yet:**

- Replace public `/launch` write path in production
- Broadcast LaunchAndBuy / approve / HoodLock
- De-surface `$TAPE` or change brand colours
- Ship indexer cutover
- Require whitelist assumptions — use live `canLaunch`

## 20. Explicit no-change confirmation

| Check | Result |
|---|---|
| application code changed | **NO** |
| production config changed | **NO** |
| env changed | **NO** |
| token launched | **NO** |
| approval broadcast | **NO** |
| HoodLock lock broadcast | **NO** |
| deployment performed | **NO** |
| commit created | **NO** |
| push performed | **NO** |

---

*Gate 2 complete. Only artifact added: this report. Working tree otherwise unchanged.*
