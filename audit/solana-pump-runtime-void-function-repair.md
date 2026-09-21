# Solana Pump runtime `(void 0) is not a function`

## 1. Verdict

`BLOCKED — EXISTING SOLANA BROADCAST REQUIRES RECOVERY`

## 2. UTC timestamp

2026-09-21T16:05:04Z

## 3. Original attempt classification

BROADCAST UNKNOWN

No mint and no signature were stored. `runPublicPumpLaunch` assigns `signature` only from the return value of `walletProvider.signAndSendTransaction`. That return is `base58.encode(result.signature)` inside Reown `WalletStandardProvider`. The encode throw happens after `feature.signAndSendTransaction` resolves, so Phantom can already have broadcast the create. The signature bytes were dropped before `/api/launch/pump/confirm` and `/api/launch/pump/complete`.

Vercel runtime logs and the browser stack were not available from this environment (GitHub deployments API returned Forbidden on earlier gates). Classification is from the shipped client bundle and the installed provider source, not from a captured production stack frame.

## 4. Exact failing call

- File: `@reown/appkit-adapter-solana@1.8.23` `WalletStandardProvider.signAndSendTransaction`, bundled from the launch call in `apps/web/src/lib/launch/run-public-pump-launch.ts`
- Function: `signAndSendTransaction`
- Expected callable: `base58.encode` (bs58 codec) on the signature bytes returned by the wallet
- Actual runtime value: webpack module `70425` export `A` is the base-x factory (`function (alphabet) { ... }`), not `basex(ALPHABET)`. `A.encode` is `undefined`
- Why production produced `(void 0) is not a function`: the client chunk calls `d.A.encode(r.signature)` after the wallet feature returns. `.encode` on that factory is missing, so the callee is `undefined`. Minified output writes undefined as `void 0`. Node reproduces `d.A.encode is not a function` for that property call, and `(void 0) is not a function` when the callee expression is `void 0`. The production client chunks contain no literal `(void 0)(` call. This is the only undefined call on the Phantom launch success path. SIWS does not use this encode; `signMessage` returns raw bytes, which is why auth succeeded and launch failed.

Local production bundle evidence (pre-fix `.next` client chunks):

- `7686.*.js`: `partialSign` then `signAndSendTransaction(tx, { skipPreflight: false, preflightCommitment: "confirmed" })`
- `3528.*.js` WalletStandard method: `await feature.signAndSendTransaction(...)` then `d.A.encode(r.signature)`
- `1600.*.js` module `70425`: `i.d(t,{A:()=>r}); let r=function(e){ if (e.length>=255) throw TypeError("Alphabet too long") ...`

`WalletStandardProvider.signTransaction` does not call `d.A.encode`. It returns `Transaction.from(result.signedTransaction)`.

## 5. Pipeline stage matrix

| Stage | Result |
|---|---|
| metadata | Reached. Encode is after artwork pin, prepare, and `Transaction.from`. |
| prepare | Reached. `signAndSendTransaction` is only called when `transactionBase64` is present. |
| deserialize | Reached. `Transaction.from` and `partialSign` run before the provider call. |
| provider acquired | Reached. Phantom SIWS was already confirmed working. |
| wallet sign/send | Wallet feature returned, then encode threw. Broadcast state is unknown. |
| signature returned | Failed. The string was never assigned. |
| confirm | Not called. |
| complete | Not called. |

## 6. Root cause

The create-only client called `Provider.signAndSendTransaction`. In `@reown/appkit-adapter-solana@1.8.23`, that method awaits the wallet-standard sign-and-send feature (which broadcasts) and then encodes `result.signature` with `import base58 from 'bs58'`. The Next client bundle binds that import to the base-x factory, which has no `.encode`. The app's own `bs58` import used by SIWS is a real codec and is not on this path.

## 7. Fix

Repair SHA: `58ddbdb9ec66eb1851f68cb77e9a374f74d4daff`

- `apps/web/src/lib/launch/pump-wallet-broadcast.ts` — require `signTransaction`, partial-sign the mint, then `connection.sendRawTransaction`. Never calls `signAndSendTransaction`.
- `apps/web/src/lib/launch/run-public-pump-launch.ts` — uses that helper. Confirm still runs only after a signature string exists. A prior signature still refuses a new mint.
- `apps/web/src/components/launch/LaunchFlowLive.tsx` — passes `useAppKitConnection().connection`. `/api/launch/pump/complete` still runs only after `runPublicPumpLaunch` returns ok.
- Tests: `pump-wallet-broadcast.test.ts`, `run-public-pump-launch.test.ts`

Post-fix client chunk `2855.29224c79bff1f201.js` contains `solana_wallet_signer_unavailable` and `sendRawTransaction`, and does not contain `signAndSendTransaction`.

## 8. Runtime guards

- `solana_wallet_signer_unavailable` — `signTransaction` is not a function. UI: sign in again from the top-right.
- `solana_rpc_unavailable` — AppKit connection cannot `sendRawTransaction`. UI: refresh and try again.
- `prepared_transaction_invalid` — base64 decode, `Transaction.from`, `partialSign`, or the signed transaction cannot be serialized. UI: start the launch again.
- Wallet rejection (`reject` / `denied` / `cancel` / code `4001`) still clears the mint attempt and does not send.

## 9. Tests

```bash
pnpm --filter @scoop/web exec vitest run src/lib/launch/pump-wallet-broadcast.test.ts src/lib/launch/run-public-pump-launch.test.ts
```

9 passed.

```bash
pnpm --filter @scoop/web run typecheck
pnpm --filter @scoop/web run build
```

Both exited 0. Build warnings are the existing MetaMask optional dependency, Pump SDK `createRequire` parse note, and ox critical-dependency warning.

Covered:

- missing `signTransaction` → controlled error, no send, no `signAndSendTransaction`
- missing connection → controlled error, no sign
- malformed base64 → controlled error, no sign, no send
- prepare → deserialize → partial sign → `signTransaction` → one `sendRawTransaction` → signature string
- wallet rejection does not send
- confirm is requested only after the signature, and `/api/launch/pump/complete` is not called inside `runPublicPumpLaunch`
- a prior signature does not fetch or send again

## 10. Production deploy

- Repair SHA: `58ddbdb9ec66eb1851f68cb77e9a374f74d4daff`
- Vercel deployment: pending push of this commit to `main`
- status: not yet deployed at report write time

## 11. Production actions

- Solana tx broadcast during repair: NO
- Pump worker enabled: NO
- Render changed: NO
- Supabase changed: NO
- RHC changed: NO

## 12. Exact next step

`NEXT STEP: RECOVER THE EXISTING MINT/SIGNATURE; DO NOT RELAUNCH.`

Check Phantom activity for the failed attempt. If a signature exists, confirm and complete that mint. Do not start a second create. The repaired signer is for a later attempt only after that check shows Phantom never broadcast.
