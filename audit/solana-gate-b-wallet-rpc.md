# Gate B — Solana Wallet + RPC Foundation

## Verdict

`BLOCKED — LIVE SOLANA WALLET CONNECT NOT VERIFIED`

Foundation work is in place and Robinhood/EVM regression checks pass. Solana mainnet RPC health + balance reads via SCOOP’s probe API are verified. A **real Solana wallet was not connected interactively** in this session (no browser wallet available to the agent), so the Gate B completion rule cannot return PASS yet.

**To flip to PASS:** set `NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE=1`, run `apps/web`, open `/dev/solana-wallet-probe`, connect Phantom (or another Solana wallet), confirm balance + optional message sign, then re-record the Wallet test section.

---

## Git state

| Field | Value |
|-------|-------|
| branch | `main` |
| HEAD before | `2de0f723fae783463c39daed2d9a235255cb07e8` |
| HEAD after | `2de0f723fae783463c39daed2d9a235255cb07e8` (no commit; changes uncommitted) |
| changed files | See **Files changed** below |

---

## Packages

| Package | Exact version | Reason |
|---------|---------------|--------|
| `@reown/appkit-adapter-solana` | `1.8.23` | Matches installed `@reown/appkit` / `@reown/appkit-adapter-wagmi` `1.8.23`. Official sibling adapter for `createAppKit({ adapters: [...] })`. |
| `@solana/web3.js` | `1.98.4` | Same version depended on by the Solana adapter. Used for server RPC (`Connection`) and pubkey parsing. **Not** `@solana/kit` — adapter stack is web3.js. |

**B.1 compatibility:** `@reown/appkit-adapter-solana@1.8.23` exists on npm and pins `@reown/appkit@1.8.23` + `@solana/web3.js@1.98.4`. No AppKit upgrade required. Not `BLOCKED — REOWN VERSION COMPATIBILITY`.

---

## Reown configuration

| Item | Status |
|------|--------|
| Existing EVM adapter | **Active** — `scoopWagmiAdapter` (`WagmiAdapter`), Robinhood-only networks |
| Solana adapter | **Active** — `scoopSolanaAdapter` (`SolanaAdapter`) |
| Configured networks | AppKit: Robinhood `eip155:4663` + Solana mainnet `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. Wagmi: Robinhood only |
| Default network | Robinhood Chain (unchanged) |
| SIWE | Untouched — Solana is connect-only in this gate |

Wiring: `apps/web/src/lib/auth/wagmi-config.ts` + `WalletRuntimeProviders.tsx`  
`createAppKit({ adapters: [scoopWagmiAdapter, scoopSolanaAdapter], networks: scoopAppKitNetworks, defaultNetwork: robinhoodAppKitChain, … })`

---

## Solana RPC

| Item | Value |
|------|-------|
| env variable | `SOLANA_RPC_URL` (server only; documented in `.env.example`) |
| module | `apps/web/src/lib/solana/rpc.ts` |
| client | `@solana/web3.js` `Connection`, `commitment: 'confirmed'` |
| cluster | `mainnet-beta` only |
| independence | No viem / Wagmi / Robinhood imports |
| mainnet-beta health | **PASS** |
| latest slot observed | `448863092` (probe API); earlier direct check `448861574` |
| API keys | Not printed |

Balance path (same RPC, not a connected wallet): system program `111111…11` → `1e-9 SOL` via `/api/dev/solana-probe?address=…`.

`NEXT_PUBLIC_SOLANA_RPC_URL` was **not** added — balance/health go through the server probe API.

---

## Wallet test

| Item | Result |
|------|--------|
| wallet provider used | **Not connected in-session** |
| connected public key | — |
| SOL balance | — (RPC balance path verified independently; see Solana RPC) |
| network | `mainnet-beta` (configured) |
| signing capability | **Code-verified:** Reown Solana `Provider` exposes `signMessage`, `signTransaction`, `signAndSendTransaction`. Probe UI calls `signMessage` only (no broadcast). **Live sign not executed.** |
| probe route | `/dev/solana-wallet-probe` (flag: `NEXT_PUBLIC_SCOOP_SOLANA_WALLET_PROBE=1`) |
| probe page compile | Loaded under `next dev` (200); shows Gate B loading / connect UI |

---

## Robinhood regression

| Check | Result |
|-------|--------|
| AppKit / Wagmi still boot | Yes — Wagmi adapter retained; default network Robinhood |
| chainId 4663 | Preserved in `scoopWagmiNetworks` / `robinhoodAppKitChain` |
| SIWE tests | PASS (`session.test.ts`, `siwe.test.ts`) |
| Pons launch tests | PASS (filtered launch + auth + solana = **316 passed**) |
| Launch behaviour changed? | **No** — no Pons/orchestrator edits |
| EVM type regression | typecheck PASS |
| Overall | **PASS** (not `BLOCKED — ROBINHOOD WALLET REGRESSION`) |

---

## Build/test results

| Command | Result |
|---------|--------|
| `pnpm --filter @scoop/web run typecheck` | PASS |
| Solana foundation + wagmi-config + auth tests | PASS |
| Launch + Solana + auth vitest (47 files / 316 tests) | PASS |
| `pnpm --filter @scoop/web run build` | PASS — includes `/dev/solana-wallet-probe` |
| Live `/api/dev/solana-probe` | PASS (`rpc: PASS`, slot observed) |

---

## Files changed

### Modified
- `apps/web/package.json` — add Solana adapter + web3.js
- `pnpm-lock.yaml`
- `.env.example` — `SOLANA_RPC_URL`, probe flag docs
- `apps/web/next.config.ts` — transpile `@reown/appkit-adapter-solana`
- `apps/web/src/lib/auth/wagmi-config.ts` — dual adapters / network split
- `apps/web/src/lib/auth/wagmi-config.test.ts`
- `apps/web/src/components/auth/WalletRuntimeProviders.tsx`

### Added
- `apps/web/src/lib/solana/rpc.ts`
- `apps/web/src/lib/solana/networks.ts`
- `apps/web/src/lib/solana/pubkey.ts`
- `apps/web/src/lib/solana/wallet-probe.ts`
- `apps/web/src/lib/solana/solana-foundation.test.ts`
- `apps/web/src/app/api/dev/solana-probe/route.ts`
- `apps/web/src/app/dev/solana-wallet-probe/page.tsx`
- `apps/web/src/components/dev/SolanaWalletProbeClient.tsx`
- `apps/web/src/components/dev/SolanaWalletProbeLive.tsx`
- `audit/solana-gate-b-wallet-rpc.md` (this report)

### Explicitly not changed
- DB / migrations, token pages, Pons launch txs, workers, SIWE session model, homepage branding

---

## Risks / remaining gaps

1. **Live wallet connect** — required for Gate B PASS; probe is ready, not exercised with Phantom/etc.
2. **AppKit Solana default RPC** — wallet adapter uses Reown/WalletConnect catalogue RPC for Solana UI; SCOOP balance/health use `SOLANA_RPC_URL`. Fine for Gate B; Pump later may want custom Solana RPC in AppKit.
3. **Email / embedded** — still eip155-oriented; Solana connect is external-wallet oriented.
4. **No session persistence** for Solana addresses (by design this gate).
5. **pnpm store / install** — install briefly dropped some workspace links (`openai`); resolved with `pnpm install` / news filter install. Watch CI install health.

---

## Recommended Gate C

`Pump.fun Launch Integration Feasibility + Transaction Construction`

Do not begin Gate C until Gate B is flipped to PASS via a real Solana wallet connect + balance display on `/dev/solana-wallet-probe`.
