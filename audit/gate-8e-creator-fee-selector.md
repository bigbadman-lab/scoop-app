# Gate 8E — Creator Fee selector

## 1. Verdict

PASS — CREATOR FEE SELECTOR DEPLOYED; CANARY NOT RUN

## 2. UTC timestamp

2026-09-19T21:57:00Z

## 3. Git/deploy state

- pre-HEAD: `4e43fd60ee42cc53984a08dd6e15f604c5037713`
- commit SHA: `e14f68c3b29899341bf0c4ef9370e09c8a9fae5c`
- push: `4e43fd6..e14f68c` on `main`
- Vercel production deploy completed: https://vercel.com/cope2/scoop-web/2VkEPowQ3BviVC3K7qBLSppcs7ti
- Render indexer deploy `dep-dang997f3r2c73e1n36g` for this commit was canceled. Paused workers were not resumed.

## 4. Public options

```text
1% = 100 bps
2% = 200 bps
default = 1%
```

There is no 0% option and no free-form basis-points field. New public launches reject any value other than 100 or 200.

## 5. Pons wiring

```text
creatorTaxBps = selected value
creatorFeeRecipient = connected creator wallet
buybackEnabled = true
```

`buildPonsTokenParams` still sets `creatorFeeRecipient` to the creator address and rejects any other recipient. Config 0, ETH pair, dev buy, slippage, salt, and live economics pinning are unchanged.

The only public path that previously forced `creatorTaxBps = 0` was `runPublicPonsLaunch`. It now passes the form selection.

## 6. Live cap validation

Preflight still reads `maxCreatorTaxBps` from the Pons factory at launch time. If the selected fee is above that live cap, launch stops with `CREATOR_TAX_TOO_HIGH` before any wallet broadcast. The selection is not clamped. Tests cover 100 and 200 accepted when the cap is 1000, and 200 blocked when the cap is 150.

## 7. Persistence/recovery

`creatorTaxBps` is written by `createOrResumePonsDraft` before simulation and broadcast. The creator wallet is already the persisted creator and remains the fee recipient.

After `ponsTxHash` exists, a later selection does not overwrite `creatorTaxBps`.

Compatibility:

- A pre-broadcast draft still at 0 adopts the current public selection (default 100) the next time the draft is saved. It has not been broadcast, so no onchain economics change.
- A post-broadcast record with historical `creatorTaxBps = 0` stays 0. Recovery displays `Creator Fee: 0%` and does not rewrite it to 100 or 200.

## 8. Tests/build

- Public fee mapping, validation, UI (two options, default 1%, switch to 2%, no 0%, no numeric field), review copy, Dev Supply regression, and historical 0 recovery: passed.
- Probe and final simulation both receive the selected bps. Broadcast request uses that same value.
- Pons adapter, lifecycle, HoodLock, and Dev Supply tests: passed.
- Web typecheck: passed.
- Web production build: passed.

## 9. Production smoke

`https://scoop.fun/launch` returned 200. No wallet was connected and Launch was not clicked.

On the live Dev Buy step:

- Creator Fee showed exactly `1%` and `2%`
- `1%` was selected by default
- switching to `2%` worked
- helper copy matched the brief
- Dev Supply still showed all five options, with 6 Months selected by default
- Burn Dev Supply still showed “Permanent and irreversible.”
- at 390px the two fee buttons stayed side by side inside the page (358px row, no overflow)

Review still requires a connected wallet before that step opens, so the live review ticket was not opened. `Creator Fee: 1%` and `Creator Fee: 2%` were verified in the review component test for this commit.

`https://scoop.fun/api/launch/pons-schema-ready` returned `ready: true`.

## 10. Explicit no-mutation proof

```text
DB migration: NO
indexer config change: NO
workers resumed: NO
Pons launch broadcast: NO
HoodLock approval: NO
HoodLock lock: NO
burn transfer: NO
```

## 11. Next step

Gate 8 controlled production canary.

Recommended first canary:

```text
Creator Fee = 1%
Dev Supply = 6 Months
```
