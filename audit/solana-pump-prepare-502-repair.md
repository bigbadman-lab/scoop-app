# Solana Pump prepare 502 repair

## 1. Verdict

`PASS — PUMP PREPARE 502 REPAIRED`

## 2. UTC timestamp

2026-09-21T17:00:00Z

## 3. Production failure evidence

- Route: `POST https://scoop.fun/api/launch/pump/prepare`
- Status (pre-fix funded attempt): HTTP `502`
- Response body (after staged errors landed):  
  `{"ok":false,"error":"pump_sdk_unavailable","message":"pump_sdk_unavailable:MODULE_NOT_FOUND","stage":"pump_sdk_build","requestId":"…"}`
- Pre-fix root evidence in local production build of the then-current main:  
  `loadPumpSdk` compiled to `(void 0)("@pump-fun/pump-sdk")` / later a webpack `MODULE_NOT_FOUND` stub, so the first funded prepare crashed after `getBalance` + `getLatestBlockhash`.
- Unfunded prepare still returned `400 insufficient_sol` (RPC healthy; SDK never loaded on that path).
- Vercel request id example (post-observability): `d154108c-09ec-45d1-a42a-e302b996ab53` (`pump_sdk_unavailable:MODULE_NOT_FOUND`).

Latest attempt for this gate was pre-broadcast: prepare 502 before Phantom signing.

## 4. Stage matrix

| Prepare stage | Result |
|---|---|
| request parse | PASS |
| SIWS session | NOT REACHED (prepare does not gate on session; unchanged) |
| address validation | PASS |
| getBalance | PASS |
| balance gate | PASS (funded creator) |
| getLatestBlockhash | PASS |
| Pump SDK init | FAIL → fixed (was MODULE_NOT_FOUND / void require) |
| create instruction | FAIL → fixed |
| transaction build | FAIL → fixed |
| serialization | FAIL → fixed |
| response | FAIL → fixed (`200` + `transactionBase64`) |

## 5. Exact root cause

- File: `apps/web/src/lib/launch/adapters/pump/sdk.ts` + `apps/web/next.config.ts`
- Function: `loadPumpSdk` / Next webpack server externals for `@pump-fun/pump-sdk` (and later its graph)
- Failing call/data:
  1. Original: `createRequire(path.join(process.cwd(), 'package.json'))('@pump-fun/pump-sdk')` rewritten by webpack to `(void 0)("@pump-fun/pump-sdk")`.
  2. After literal `require`: free `require` missing on Vercel → webpack stub module that always throws `MODULE_NOT_FOUND`.
  3. After bundling only the entry package: remaining externals (`@pump-fun/pump-swap-sdk` / `@coral-xyz/anchor`) still threw `MODULE_NOT_FOUND` while loading create_v2.
- Why 502: prepare’s catch mapped the thrown load error to HTTP `502` at stage `pump_sdk_build`. Unfunded wallets never reached that stage, which is why earlier `insufficient_sol` probes looked healthy.

## 6. Fix

Shipped on `main` (final fix SHA `df9ed9e27a4464fc518ceb456f386718a651732b`):

- `apps/web/next.config.ts` — stop `serverExternalPackages` / webpack `externals` for `@pump-fun/*` and `@coral-xyz/anchor` so create_v2’s graph is webpack-bundled into the prepare serverless chunk.
- `apps/web/src/lib/launch/adapters/pump/sdk.ts` — load via bundled `require('@pump-fun/pump-sdk')` with export guards.
- `apps/web/src/app/api/launch/pump/prepare/route.ts` — staged errors, `requestId`, safe JSON codes, structured logs.
- Tests: `route.test.ts`, `sdk-load.test.ts`.

Intermediate SHAs on the path: `b449a33`, `5e868a4`, `a59347d`, then `df9ed9e`.

## 7. Error observability

Safe codes / stages:

- `invalid_json`, `validation_failed`
- `solana_rpc_unavailable`, `solana_rpc_balance_failed`, `solana_rpc_blockhash_failed`
- `insufficient_sol`
- `pump_sdk_unavailable`, `pump_sdk_export_missing`
- `pump_prepare_build_failed`, `pump_prepare_serialize_failed`

Logs: `{ scope: "pump_prepare", requestId, stage, ok, error, creator, mint, elapsedMs }` — no RPC URL, secrets, cookies, or mint secrets.

## 8. Tests

```bash
pnpm --filter @scoop/web exec vitest run \
  src/lib/launch/adapters/pump/sdk-load.test.ts \
  src/app/api/launch/pump/prepare/route.test.ts \
  src/lib/launch/adapters/pump/pump-adapter.test.ts
```

15 passed (validation, RPC failure codes, insufficient_sol, funded prepare → base64, SDK load, serialize/partial-sign round-trip without broadcast).

## 9. Build/typecheck

```bash
pnpm --filter @scoop/web run typecheck   # exit 0
pnpm --filter @scoop/web run build       # exit 0
```

## 10. Production deploy

- SHA: `df9ed9e27a4464fc518ceb456f386718a651732b`
- Vercel deployment ID: `6573641817`
- Status: success — https://vercel.com/cope2/scoop-web/87wAwH8Vn95xMMN9uxE5qdEi6uJV

## 11. Production prepare-only proof

- HTTP status: `200`
- valid `transactionBase64`: YES (length 1128; deserializes to 1 instruction)
- `requestId`: `dbb1decf-2f80-4b4e-bd4a-0121a5f66584`
- wallet signing/broadcast performed: NO  
  (prepare-only POST with a funded fee-payer pubkey and ephemeral mint; response not sent to Phantom)

## 12. Production actions

- blockchain tx broadcast: NO
- new mint created onchain: NO
- Pump worker enabled: NO
- Render changed: NO
- Supabase changed: NO
- RHC changed: NO
- dev buy added: NO

## 13. Exact next step

`NEXT STEP: RUN EXACTLY ONE BASE SOLANA/PUMP CANARY USING THE REPAIRED PREPARE + SIGNER PATH. DO NOT ADD DEV BUY UNTIL THE BASE CREATE SUCCEEDS.`
