# HoodLock (RHC) forensic inspection — TAPE TGE custody gate

Read-only inspection of the candidate HoodLock ERC-20 locker on Robinhood Chain before SCOOP designs `tape:lock-dev-tokens`.

Evidence classes used below:

| Tag | Meaning |
|---|---|
| **PROVEN** | Observed on-chain via eth_call / eth_getCode / eth_getStorageAt, or from Blockscout-verified source whose deployed bytecode SHA-256 matches live code |
| **DOCUMENTED** | HoodLock marketing/docs/API text only (not independently binding) |
| **NOT PROVEN** | Searched; no reliable evidence |

No transactions, signatures, approvals, locks, private keys, production writes, DB writes, source edits, stage, commit, push, or deploy were performed for this inspection.

---

## 1. Verdict

```text
PASS — HOODLOCK TECHNICALLY SUITABLE FOR TAPE DEV-BUY LOCK
```

Technical properties required for a TAPE ERC-20 / fee-on-transfer-compatible timed lock are **PROVEN** from verified source tied to live bytecode on chainId `4663`. Remaining items are trust/ops caveats (no independent third-party audit located; shared per-token vault; locker uses raw IERC20 bool returns; admin can raise fee for *new* locks; lock ownership is transferable by the lock owner).

---

## 2. Observed UTC timestamp

Primary live RPC snapshot: **2026-09-15T11:53:35Z**
Blockscout source fetch / bytecode hash cross-check: **2026-09-15T11:51:51Z** (approx.)

Public RPC used: `https://rpc.mainnet.chain.robinhood.com`
Explorer: `https://robinhoodchain.blockscout.com`

---

## 3. SCOOP repository state

```text
branch:  main
HEAD:    964b3af5ae5d6ba766a3a14f0cfa03b91ec5c7ac
```

Matches the pre-TGE product freeze expected in the brief. Working tree remains dirty with unrelated audit / P10.4 untracked files; **none were staged or modified** for this task. Only new file created: this report.

Repo search for `hoodlock` / `0xd0f7…` under product source: **NOT FOUND** (no SCOOP product wiring yet).

---

## 4. Canonical HoodLock RHC deployment

| Field | Value | Class |
|---|---|---|
| Address | `0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F` | PROVEN |
| chainId | `0x1237` = **4663** | PROVEN (`eth_chainId`) |
| Live code size | **4941** bytes | PROVEN |
| Live code SHA-256 | `00da4abbf3346b85776997ab2bda43d07a35970a16819478523f3249d7cd4cf4` | PROVEN |
| Blockscout name | `RobinhoodLocker` | PROVEN |
| Fully verified | `true`; `is_changed_bytecode: false` | PROVEN |
| Compiler | Solidity `v0.8.35+commit.47b9dedd`, optimizer on, runs `200` | PROVEN |
| Verified at | `2026-07-08T19:01:37.108439Z` | PROVEN |
| Creation tx | `0x060f96b101619990734aa1aa1dac16c73df1915fd4edb99ffa3b1ce7059925f8` | PROVEN |
| Creation block / time | `4591195` / `2026-07-08T19:00:56.000000Z` | PROVEN |
| Deployer / creator | `0xb252140D8Db40Ca2dC2D28f17C1B771796Af0960` | PROVEN |
| Constructor args | `_fee = 0`, `_feeCollector = 0xb252…0960` | PROVEN |
| Official docs locker | Same address on https://hoodlock.tech/docs/contracts and homepage | DOCUMENTED + address match PROVEN |
| Official API config locker | Same address in https://hoodlock.tech/docs/api example `/api/dev/config` | DOCUMENTED |
| Older/newer locker on RHC | Not exhaustively enumerated chain-wide; **current published locker identity is this address** | DOCUMENTED / partial |

**Identity conclusion:** Candidate address is the live, verified `RobinhoodLocker` currently published by HoodLock for RHC. Docs and deployed identity **do not conflict**.

Explorer: https://robinhoodchain.blockscout.com/address/0xD0f7d8c6e9f6D80c297bEbe4F7fD1B9C8125C32F?tab=contract

---

## 5. Source ↔ bytecode verification

| Check | Result |
|---|---|
| Blockscout `is_fully_verified` | `true` |
| Blockscout `is_changed_bytecode` | `false` |
| Live `eth_getCode` SHA-256 == Blockscout `deployed_bytecode` SHA-256 | **MATCH** (`00da4abb…d7cd4cf4`) |
| Contract file | `RobinhoodLocker.sol` (single-file source, 5685 chars) |

**PROVEN:** The source analyzed below is the source that compiles to the bytecode currently executing at the candidate address.

---

## 6. Proxy / upgradeability analysis

| Check | Result | Class |
|---|---|---|
| Blockscout `proxy_type` | `null` / none | PROVEN |
| EIP-1967 implementation slot | `0x00…00` | PROVEN |
| EIP-1967 admin slot | `0x00…00` | PROVEN |
| EIP-1967 beacon slot | `0x00…00` | PROVEN |
| Source `delegatecall` / `upgradeTo` / `upgradeToAndCall` / `diamondCut` / `selfdestruct` | **0 matches** | PROVEN |
| Architecture | Direct immutable implementation | PROVEN |

**Conclusion:** Not a proxy / UUPS / transparent / beacon / diamond. Logic cannot be swapped via standard upgrade patterns present in this bytecode/source.

---

## 7. Complete callable surface

External/public ABI (PROVEN from verified ABI + source):

| Function | Role |
|---|---|
| `lock(token,amount,unlockTime)` payable | Create lock; pull tokens; charge ETH fee |
| `withdraw(id)` | Owner withdraw after unlock |
| `extend(id,newUnlockTime)` | Owner push unlock later only |
| `transferLockOwnership(id,newOwner)` | Owner reassign withdraw right |
| `setFee` / `setFeeCollector` / `setAdmin` | Admin fee/role config only |
| Views | `locks`/`getLock`, `lockedAmount`, `isUnlocked`, `timeRemaining`, `locksByOwner`, `locksByToken`, `totalLocks`, `nextLockId`, `fee`, `feeCollector`, `admin` |

Events: `Locked`, `Withdrawn`, `Extended`, `LockOwnershipTransferred`, `FeeChanged`.

**No** `rescue` / `sweep` / `emergencyWithdraw` / pause-redirect / token-admin paths in source (PROVEN by full-source search).

---

## 8. Lock storage/accounting model

```solidity
struct Lock {
  address owner;
  address token;
  uint256 amount;      // amount actually received (balance delta)
  uint256 unlockTime;
  bool withdrawn;
}
```

- One contract vault holds many locks (`nextLockId` counter; mappings `_byOwner` / `_byToken`).
- **Per-token shared balance pool:** withdrawals transfer exactly `l.amount` of `l.token` from the contract’s aggregate balance.
- Accounting credit is **balance-delta**, not the caller’s requested `amount` (FOT-safe for simple fee-on-transfer).

**Implication (PROVEN from design):** Ordinary / simple FOT ERC-20s are fine. Rebasing / reflection / silent balance mutation tokens can underfund the shared pool; last withdrawers can revert. HoodLock docs admit this; source does not enforce token class.

---

## 9. `lock()` execution trace

From verified source (abbreviated):

1. `nonReentrant`
2. `msg.value >= fee`
3. `amount > 0`, `token != 0`, `unlockTime > block.timestamp`
4. `balBefore = balanceOf(this)`
5. `transferFrom(msg.sender, this, amount)` must return `true`
6. `received = balanceOf(this) - balBefore`; require `received > 0`
7. Assign `locks[id]` with `amount: received`, `owner: msg.sender`
8. Forward `fee` ETH to `feeCollector`; refund excess ETH to caller
9. Emit `Locked`

**Asset movement into custody:** only via this `transferFrom` path during `lock`.

---

## 10. Fee-on-transfer proof

**PROVEN from verified source** (not marketing):

```solidity
uint256 balBefore = IERC20(token).balanceOf(address(this));
require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transferFrom failed");
uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;
require(received > 0, "nothing received");
// ...
locks[id] = Lock({ ..., amount: received, ... });
```

| Token class | Compatibility |
|---|---|
| Standard ERC-20 (`received == amount`) | Compatible |
| Simple fee-on-transfer (`received < amount`) | Compatible — lock records `received` |
| Rebasing / reflection / balance-mutating | **Unsupported** — shared-pool shortfall risk |
| Tokens returning no `bool` | May revert on raw `require(transfer…)` (locker has **no** SafeERC20) |

TAPE model (ordinary or simple FOT) is compatible with the recording rule. Exact TAPE bytecode is not yet the subject of this gate.

---

## 11. Withdrawal execution trace

```solidity
function withdraw(uint256 id) external nonReentrant onlyLockOwner(id) {
  Lock storage l = locks[id];
  require(!l.withdrawn, "already withdrawn");
  require(block.timestamp >= l.unlockTime, "still locked");
  l.withdrawn = true;
  require(IERC20(l.token).transfer(l.owner, l.amount), "transfer failed");
  emit Withdrawn(id, l.owner, l.amount);
}
```

**PROVEN gates:** caller must be current `l.owner`; must be at/after `unlockTime`; once; transfers to `l.owner` (not an arbitrary destination).

---

## 12. Early-withdrawal path search

Searched full verified source + ABI for any path that moves ERC-20 out of the vault before `unlockTime`.

| Path | Can move locked tokens early? | Evidence |
|---|---|---|
| `withdraw` | No — timestamp gate | PROVEN |
| `lock` | Only inbound (+ ETH fee) | PROVEN |
| `extend` | No token transfer | PROVEN |
| `transferLockOwnership` | Ownership only | PROVEN |
| `setFee` / `setFeeCollector` / `setAdmin` | No token transfer | PROVEN |
| rescue/sweep/emergency/selfdestruct | Absent | PROVEN |
| Admin as special withdrawer | Absent | PROVEN |

**Result:** No reachable early-withdrawal path for locked ERC-20 balances under this bytecode.
If early exit existed → FAIL. It does not → property **PASSES**.

---

## 13. Admin powers

Live state @ 2026-09-15T11:53:35Z (**PROVEN**):

| Field | Value |
|---|---|
| `admin` | `0x79c1230cab12d53d040f5fe1f5279e1a481ccea2` |
| `feeCollector` | `0xd59948e49b1b56784626bde2d6d1712ed24a6bbc` |
| `fee` | `5000000000000000` wei = **0.005 ETH** |
| Deployer | `0xb252…0960` (constructor set admin=deployer; admin later rotated) |

Admin-only functions (**PROVEN**):

- `setFee(uint256)`
- `setFeeCollector(address)`
- `setAdmin(address)`

Admin **cannot** (PROVEN by absence + withdraw gating): withdraw locks, shorten unlock, seize tokens, pause, upgrade.

**Caveat (PROVEN):** Locker fee has **no hard cap** in code. Admin can set an arbitrarily high fee for *future* locks. Existing locks are unaffected; withdraw remains free.

---

## 14. Unlock-time mutability

```solidity
require(newUnlockTime > l.unlockTime, "must be later");
l.unlockTime = newUnlockTime;
```

**PROVEN:** Unlock can only move later. Cannot be shortened by owner, admin, or anyone else via this contract.

---

## 15. Lock ownership transfer

```solidity
function transferLockOwnership(uint256 id, address newOwner) external onlyLockOwner(id)
```

| Changes | Does not change |
|---|---|
| `locks[id].owner` (withdraw / extend / further transfer rights) | `token`, `amount`, `unlockTime`, vault balances |

**PROVEN:** Tokens do not move on ownership transfer. New owner inherits post-expiry withdraw right.
**Ops risk:** Compromised lock-owner key can transfer ownership before expiry (still cannot withdraw early). Index `_byOwner[prev]` is not pruned (enumeration quirk only).

---

## 16. Fee mechanics

| Item | Evidence |
|---|---|
| Flat ETH fee at lock creation | PROVEN source + live `fee() == 0.005 ETH` |
| No percentage of tokens | PROVEN (no token skim in `lock`/`withdraw`) |
| Excess ETH refunded | PROVEN |
| Withdraw / extend free (gas only) | PROVEN |
| Constructor fee was `0`; live fee later set via `setFee` | PROVEN (ctor args + live call) |
| Docs claim same 0.005 ETH | DOCUMENTED (matches live) |

---

## 17. Reentrancy / hostile-token analysis

| Control | Status |
|---|---|
| `nonReentrant` on `lock` and `withdraw` | PROVEN |
| `extend` / `transferLockOwnership` | Not reentrancy-guarded; **no token/ETH transfers** |
| Fee/refund via `call{value:}` inside `lock` | Reenter `lock`/`withdraw` blocked by guard |
| IERC20 | Raw interface + `require(bool)`; **no SafeERC20** |
| Malicious ERC-20 | Can DOS a lock (revert on transfer), lie about balances, or mutate shared pool — **token risk, not locker admin backdoor** |

Hostile-token conclusion: locker assumptions hold for well-behaved / simple FOT ERC-20s. TAPE must itself be reviewed separately before locking.

---

## 18. HoodLock API analysis

Official surface (**DOCUMENTED**, https://hoodlock.tech/docs/api):

| Item | Detail |
|---|---|
| Base | `https://hoodlock.tech/api/dev` |
| Auth | Public `pk_…` key (query/body); credits partner fee share; cannot move funds |
| `GET /config` | Returns chainId, locker address, live fees |
| `POST /lock-intent` | Returns unsigned `{to,data,value,chainId}` for `lock` |
| Approval | Caller must ERC-20 `approve` locker separately |

Unauthenticated probes without a key:

- `https://hoodlock.tech/api` → 404
- `https://hoodlock.tech/api/lock-intent` → 404

Intent endpoints require a registered developer key. API prepares txs; wallet still signs.

**Trust note:** A compromised API could return malicious `to`/`data`/`value`. Any SCOOP CLI must decode and verify locally before signing.

---

## 19. Direct-contract vs API integration recommendation

**Recommendation for future `tape:lock-dev-tokens`: direct ABI encoding against the verified locker.**

| Approach | Pros | Cons |
|---|---|---|
| Direct `lock` + local fee read | No third-party intent trust; deterministic; works if site/API disappear | Must maintain ABI + address constants with on-chain checks |
| HoodLock `/lock-intent` | Convenience; fee encoding | Requires `pk_` key; must still fully verify returned tx; partner attribution side-effects |

Preferred flow:

1. `eth_chainId == 4663`
2. `eth_getCode(locker)` hash pin / equality check
3. `fee()` fresh read
4. ERC-20 `approve(locker, amount)` (or exact needed allowance)
5. `lock(tape, amount, unlockTime)` with `value >= fee`
6. Parse `Locked` event for `id` + recorded `received`

---

## 20. Existing-lock live-state sanity checks

Live reads @ 2026-09-15T11:53:35Z (**PROVEN**):

| Call | Result |
|---|---|
| `totalLocks()` / `nextLockId()` | **407** |
| `fee()` | 0.005 ETH |
| Sample lock 0 | owner deployer; token `0xd0a8…2f65`; amount `2e24`; unlock `2026-08-06T19:31:00Z`; **not withdrawn** (past unlock — still sitting until owner claims) |
| Sample lock 1 | same token; unlock `2026-07-08T21:40:00Z`; **withdrawn = true** |
| Sample locks 404/405 | token `0xd5bf…4b94` (LOCK token); unlock `2026-09-22T10:42:00Z`; active |
| Sample lock 406 | unrelated token; unlock `2027-09-15T10:57:00Z`; active |

Behavior matches source: locks persist after unlock until owner withdraws; withdrawn flag flips; many independent owners/tokens coexist in one vault.

---

## 21. TAPE compatibility matrix

| Requirement | Result | Evidence |
|---|---|---|
| Robinhood Chain 4663 | **PASS** | `eth_chainId` |
| Canonical deployed locker proven | **PASS** | code + Blockscout + official docs address match |
| Verified source ↔ deployed contract | **PASS** | SHA-256 match; `is_changed_bytecode false` |
| Non-proxy / immutable logic | **PASS** | empty EIP-1967; no upgrade opcodes/paths |
| ERC-20 locking | **PASS** | `lock`/`withdraw` |
| Fee-on-transfer accounting | **PASS** | balance-delta `received` |
| No early withdrawal path | **PASS** | full path search |
| Admin cannot seize locked assets | **PASS** | admin surface fee-only |
| Unlock cannot be shortened | **PASS** | `extend` later-only |
| Lock ownership semantics acceptable | **PASS** | ownership ≠ early unlock; CLI must treat owner key as custody of post-expiry claim |
| Flat/native fee understood | **PASS** | live 0.005 ETH; uncapped admin setFee for new locks |
| Direct/API automation feasible | **PASS** | direct ABI preferred; API optional with verify-before-sign |
| Public on-chain verification feasible | **PASS** | events + `locks(id)` + Blockscout + HoodLock proof pages (DOCUMENTED product) |
| Independent third-party audit located | **NOT FOUND** | Web/docs search; HoodPerp audit is a different product; Titan Locker is a competitor |
| Suitable for TAPE dev-buy lock | **PASS** (technical) | With caveats in §24 |

---

## 22. Threat model

### HoodLock website disappears
**Yes — withdraw still works.** Call `withdraw(id)` on `0xD0f7…C32F` after `unlockTime` with the lock-owner key. No website dependency in bytecode.

### HoodLock API is compromised
**Mitigate by never signing opaque intents.** Decode calldata to `lock(token,amount,unlockTime)`, assert `to ==` pinned locker, `token ==` expected TAPE, `amount`/`unlockTime` match policy, `value` == fresh `fee()` (or >= with refund understanding), `chainId == 4663`.

### HoodLock admin is malicious
**Can:** raise fee for new locks; change feeCollector; rotate admin.
**Cannot:** withdraw existing TAPE lock, shorten unlock, upgrade implementation, rescue tokens.

### SCOOP deployer wallet compromised after lock
**Cannot withdraw before expiry.**
**Can** call `transferLockOwnership` / `extend` (later only). After expiry, attacker can withdraw. Treat post-lock owner key as the claim key; prefer cold/multisig owner if policy requires.

### Wrong TAPE address supplied
Future CLI must require explicit checksummed address + on-chain `symbol`/`name`/`decimals`/`totalSupply` assertions + confirm prompt; refuse if code empty.

### Fee changes immediately before execution
Re-read `fee()` in the same script run immediately before building/signing; simulate; do not cache across sessions (matches HoodLock’s own docs warning).

### RPC points to wrong chain
Hard-require `eth_chainId == 4663` before any signing path; pin locker code hash.

---

## 23. Future `tape:lock-dev-tokens` design constraints

Do **not** implement in this task. When designed:

1. Read-only preflight: chainId, code hash, fee, TAPE metadata, allowance, balances.
2. Direct ABI `lock` (API optional, never trusted blindly).
3. `value` from live `fee()`; handle refund path.
4. Record returned `id` and event `amount` (`received`), not only requested amount.
5. Emit/print Blockscout + optional HoodLock proof URL for the lock id.
6. Default owner = deployer/dev-buy recipient policy address; support explicit owner-after-lock transfer only as a separate, deliberate step.
7. Refuse rebasing/reflection tokens if detectable; document unsupported classes.
8. No `--confirm` style mutation until explicit operator gate (mirror `tape:set-contract` rehearsal discipline).

---

## 24. Known limitations / unresolved evidence

| Item | Status |
|---|---|
| Independent third-party audit of `RobinhoodLocker` | **NOT FOUND** (verification ≠ audit) |
| Exhaustive search for every historical locker deployment on RHC | Not fully enumerated; current published locker is this address |
| Formal formal-verification / invariant fuzz of shared vault | Not performed here |
| Exact TAPE token bytecode / tax / blacklist / upgradeability | Out of scope; must be a separate TGE token audit |
| SafeERC20 absence | Tokens without bool return may fail `lock`/`withdraw` |
| Shared per-token pool | Unsupported token classes can strand later withdrawers |
| Admin fee uncapped | Ops/griefing on *new* locks only |
| SCOOP product already hardcoding this address | Not present yet |

These do **not** overturn the early-withdraw / admin-seize / upgradeability proofs, but they remain visible trust/ops considerations.

---

## 25. Scope confirmation

Confirmed **not** performed:

```text
transactions
signatures
approvals
locks
private keys
production writes
DB writes
source edits
stage
commit
push
deploy
```

Allowed operations used: `eth_chainId`, `eth_getCode`, `eth_call`, `eth_getStorageAt`, Blockscout read APIs, HoodLock public docs/site GETs, local source/ABI analysis.

Only new repository file: `audit/hoodlock-rhc-forensic-inspection.md` (untracked; not staged).

---

## 26. Final gate

```text
HOODLOCK FORENSIC GATE PASSED — SAFE TO DESIGN TAPE LOCK CLI
```

Technical custody properties for locking a well-behaved TAPE ERC-20 (including simple fee-on-transfer) on this specific RHC locker are evidenced. Proceed to **design** (not yet implement/broadcast) `tape:lock-dev-tokens` under the constraints in §23, and keep the missing third-party audit + TAPE-token review as explicit parallel trust work.
