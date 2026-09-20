# Gate C — Pump.fun Launch Feasibility + Transaction Construction

## Verdict

`PASS — PUMP LAUNCH TRANSACTION PATH READY FOR CANARY`

Official `@pump-fun/pump-sdk@2.0.0` `create_v2` instructions build from SCOOP, reuse SCOOP `ipfs://` metadata within Pump limits, treat the connected Solana wallet as creator/user/fee payer, keep mint secrets client-side, and **mainnet `simulateTransaction` returns PASS** (err=null) against `SOLANA_RPC_URL`. Robinhood/Pons tests and web build remain green. Public `/launch` is untouched; no broadcast.

---

## Pump integration selected

| Item | Value |
|------|-------|
| package | `@pump-fun/pump-sdk` |
| exact version | `2.0.0` |
| official source | https://github.com/pump-fun/pump-sdk · docs https://github.com/pump-fun/pump-public-docs |
| instruction | `create_v2` via `PUMP_SDK.createV2Instruction` |
| program id | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` |
| token program | Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| peers | `@solana/web3.js@^1.98.2` (SCOOP pinned `1.98.4`), `@coral-xyz/anchor`, `@solana/spl-token`, `@pump-fun/pump-swap-sdk`, `@pump-fun/agent-payments-sdk` |

**Interop note:** ESM `import` of the SDK fails under Vite (`BN` CJS named export). SCOOP loads it via lazy CJS `createRequire` in `adapters/pump/sdk.ts` (server/test only) + webpack `externals` / `serverExternalPackages`.

---

## Pump create requirements

SCOOP Gate C defaults (forced):

- SOL pair (`quoteMint` omitted)
- `mayhemMode: false`
- `holderReward: false`
- `cashback: false` (deprecated; must not enable)
- mint = Token-2022, 6 decimals, mint account signs
- `user` = fee payer + signer; `creator` = non-default pubkey (same wallet for MVP)
- name ≤ 32, symbol ≤ 13, uri ≤ 200

---

## SCOOP metadata compatibility

- Existing launch path pins artwork to `ipfs://<cid>` (PROTOCOL_META ≤ 128 bytes).
- Pump accepts that string as `create_v2.uri` (official docs: IPFS URI).
- Adapter `projectPumpMetadataUri` **reuses the SCOOP image IPFS URI** as the create `uri` (no global metadata change).
- Optional Metaplex-style JSON projection is prepared for a future pin if product wants richer off-chain metadata; **not required** for create.
- Form note: SCOOP `META_LIMITS.nameMax` is 48 → Pump path must enforce 32 at validation (`validatePumpCreateInput`).

---

## Mint keypair lifecycle

| Rule | Implementation |
|------|----------------|
| Generate client-side | `createPumpMintAttempt()` / `Keypair.generate()` in `mint-lifecycle.ts` |
| Secret never to server | Probe POSTs **mint pubkey only** to `/api/dev/pump-build-simulate` |
| Never log secret | Handle is `{ attemptId, mintPublicKey }` only; tests assert no `secretKey` serialization |
| Ephemeral memory | In-memory `Map`; `clearPumpMintAttempt` / `replacePumpMintAttempt` on retry |
| Persist after success | Only mint pubkey (+ later `LaunchResult.assetAddress`) |

Retry: new attempt → new mint pubkey so UI cannot silently double-launch the same mint.

---

## Transaction construction

`buildPumpCreateInstruction` → `PUMP_SDK.createV2Instruction({…})`  
`buildPumpCreateTransaction` → fee payer = user, `partialSign(mintKeypair)`.

Verified accounts: **16** IDL accounts, Pump program + Token-2022 present, mint + user signers.

---

## Connected wallet signing model

1. Reown Solana wallet (`useAppKitAccount({ namespace: 'solana' })`) = `creator` = `user` = fee payer.
2. Client mint `Keypair` = mint signer (`partialSign` before wallet sign).
3. Future broadcast: `Provider.signTransaction` / `signAndSendTransaction` (Reown Solana adapter) — **not called in Gate C**.
4. Gate B live wallet used in simulation: `2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4` (~1.13 SOL).

---

## Initial buy recommendation

`RECOMMEND — CREATE ONLY`

Official TS SDK exposes `createV2AndBuyInstructions` (needs `fetchGlobal`, `solAmount`, `getBuyTokenAmountFromSolAmount`, same signers). That path is real and atomic, but adds global-state reads, amount sizing, and slippage. First canary should prove `create_v2` alone; wire create+buy after create is green.

---

## Simulation / preflight result

| Check | Result |
|-------|--------|
| method | `Connection.simulateTransaction(tx)` on mainnet via `SOLANA_RPC_URL` |
| status | **PASS** (`err: null`) |
| slot | `448866876` |
| CU | `108107` |
| fee payer balance | `1134709648` lamports |
| program / Token-2022 / 16 accounts | confirmed |
| broadcast | **none** |

Note: web3.js `1.98.4` throws `Invalid arguments` if `{ sigVerify, replaceRecentBlockhash }` is passed into the overloaded simulate API; bare `simulateTransaction(tx)` succeeds for mint-signed / fee-payer-unsigned creates.

---

## Pump dev preview

| Item | Value |
|------|-------|
| flag | `NEXT_PUBLIC_SCOOP_PUMP_PROBE=1` |
| page | `/dev/pump-launch-probe` |
| API | `POST /api/dev/pump-build-simulate` (also `pump-blockhash`, `pump-simulate`) |
| button | **Build / Simulate** only — no Launch / Send |

---

## Robinhood/Pons regression

| Check | Result |
|-------|--------|
| Pons adapter / orchestrators edited? | **No** |
| Launch unit tests | **288 passed** |
| Auth/SIWE/wagmi + Solana foundation | PASS |
| Web typecheck | PASS |
| Web build | PASS (includes Pump probe routes) |

---

## Tests/build

- `src/lib/launch/adapters/pump/pump-adapter.test.ts` — 8 tests (validation, metadata reuse, mint lifecycle, create_v2 construction, LaunchResult, CREATE_ONLY, no EVM imports)
- Launch suite regression — 43 files / 288 tests
- `pnpm --filter @scoop/web run typecheck` — PASS
- `pnpm --filter @scoop/web run build` — PASS

---

## Files changed

### Added
- `apps/web/src/lib/launch/launch-result.ts`
- `apps/web/src/lib/launch/adapters/pump/*` (adapter, build-create, metadata, mint-lifecycle, validation, types, simulate, sdk, initial-buy, probe-flag, tests)
- `apps/web/src/app/api/dev/pump-build-simulate/route.ts`
- `apps/web/src/app/api/dev/pump-simulate/route.ts`
- `apps/web/src/app/api/dev/pump-blockhash/route.ts`
- `apps/web/src/app/dev/pump-launch-probe/*`
- `apps/web/src/components/dev/PumpLaunchProbeClient.tsx`
- `apps/web/src/components/dev/PumpLaunchProbeLive.tsx`
- `audit/solana-gate-c-pump-feasibility.md`

### Modified
- `apps/web/package.json` — `@pump-fun/pump-sdk@2.0.0`
- `pnpm-lock.yaml`
- `apps/web/next.config.ts` — `serverExternalPackages` + webpack externals for Pump/Anchor
- `.env.example` — `NEXT_PUBLIC_SCOOP_PUMP_PROBE`

(Gate B Solana wallet foundation files also present on the branch from the prior gate.)

---

## Remaining risks

1. **ESM/CJS SDK load** — relies on CJS require + Next externals; watch Vercel serverless packaging.
2. **Name length** — product form still allows 48-char names; Pump rail must keep `validatePumpCreateInput`.
3. **URI semantics** — using image `ipfs://` as Pump `uri` matches official docs; if Pump UI expects JSON metadata, add a dedicated metadata pin later inside the Pump adapter only.
4. **Create+buy** — deferred; do not invent curve math.
5. **No DB / token page** for Solana mints yet (Gate D+).
6. **simulate ≠ broadcast** — fee payer must still sign + fund rent/fees for a real create.

---

## Recommended Gate D

`Pump.fun Canary Launch`

Prove one real mainnet create (dev-gated, explicit approval) with connected wallet + mint partial-sign + broadcast, then persist `LaunchResult` — **before** wiring the public `/launch` wizard (`Pump.fun Public Launch Flow Wiring`).

Do not begin Gate D in this task.
