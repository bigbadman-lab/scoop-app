# SCOOP — Unified SIWE + SIWS Account Auth

## 1. Verdict

`BLOCKED — AWAITS HUMAN SIWS VERIFICATION`

## 2. UTC timestamp

`2026-09-21T15:40:00Z`

## 3. Previous architecture problem

Solana Sign In stopped at an AppKit connection. The authoritative namespace could flip to `solana` without a server-verified signature, and `/account` rendered a separate stripped layout. EVM users continued through SIWE into `scoop_session`. Launch compatibility treated a connected Solana wallet as authenticated. Those are different products, not one SCOOP session.

## 4. Final auth architecture

```text
Top-right SIGN IN
  → wallet picker
  → EVM: existing SIWE (/api/auth/verify) → scoop_session namespace=eip155 authMethod=siwe
  → Solana: connect, then SIWS (/api/auth/siws) → same scoop_session cookie namespace=solana authMethod=siws
  → top-right account chrome (same Link → /account)
  → same AccountReady layout
  → launch rails read authenticated + authMethod + providerReady
```

SIWE identity still resolves `scoop_users`. SIWS does not write a database user (no schema change). The Solana session user id is a deterministic UUID derived from the verified public key and lives only in the sealed cookie.

## 5. SIWS implementation

| Step | Detail |
|------|--------|
| Challenge | `GET /api/auth/nonce` — 16-byte hex nonce, HMAC-sealed cookie, 10 minute TTL (shared with SIWE) |
| Message | Phantom-style SIWS text: domain, public key, statement, URI, version `1`, chain id `mainnet`, nonce, issued-at, expiration (10 min) |
| Sign | Wallet Standard `signIn` when the provider exposes it; otherwise `signMessage` over the UTF-8 message |
| Verify | `POST /api/auth/siws` — `tweetnacl` ed25519 detached verify of the exact message bytes against the base58 public key |
| Replay | Nonce cookie is cleared on success and on every failed verify. A second verify has no nonce. |
| Settlement | `createSiwsSession` seals `scoop_session` with `namespace: solana`, `authMethod: siws`, verified address |

Client code does not mark the session authenticated. Only a verified cookie does.

## 6. Unified session contract

Sealed `scoop_session`:

- `authenticated` (presence of a valid cookie)
- `namespace`: `eip155` \| `solana`
- `address`: checksummed/lowercase `0x` or base58 public key
- `authMethod`: `siwe` \| `siws`
- `userId`, `chainId`, `issuedAt`, `expiresAt`

Client snapshot (`ScoopAuthSnapshot`) plus provider readiness (`useScoopWalletSession`) drives chrome, `/account`, and launch. `getAuthenticatedScoopUser` still returns EVM SIWE sessions only, so existing account/profile APIs do not treat a Solana key as an Ethereum user.

## 7. Account UI unification

Solana SIWS sessions render `AccountReady` — the same header, wallet panel, copy address, and “Sign out of SCOOP” control as EVM.

EVM-only profile save, fees, and holder rewards stay in the same page and show `Not available on Solana yet`.

There is no separate Solana card layout.

## 8. Launch auth cleanup

- Launch-local auth buttons = 0
- Top-right Sign In is the only clickable auth entry
- Passive copy only, including wrong-wallet messages that point at account sign-out

## 9. Launch compatibility matrix

| Session | PONS | Pump |
|---------|------|------|
| none | BLOCKED (`requires_sign_in`) | BLOCKED (`requires_sign_in`) |
| eip155 / SIWE | ALLOWED when the EVM provider is ready | BLOCKED (`incompatible_namespace`) |
| solana / SIWS | BLOCKED (`incompatible_namespace`) | ALLOWED when the Solana provider is ready |

A Solana wallet that is connected but has not completed SIWS stays blocked.

## 10. Security review

- Server-side verification: YES (`verifySiwsSignature` on `/api/auth/siws`)
- Nonce: YES (16 random bytes, sealed cookie)
- Replay protection: YES (cookie consumed on success and failure)
- Domain/origin binding: YES (same host/origin rules as SIWE)
- Expiry: YES (issued-at skew + expiration time on the message, plus nonce TTL)
- Client-trusted settlement: NO

## 11. Tests

```text
vitest run siws-verify, session, rail-compatibility, AccountPageLive,
WalletSlotLive, pump-rail, ScoopWalletConnect, siwe-session-client,
siwe, scoop-auth-events
```

Result: pass (SIWS verify covers valid signature, bad signature, wrong domain, expiry, nonce mismatch, and SIWS cookie seal).

```text
pnpm --filter @scoop/web run typecheck  → pass
pnpm --filter @scoop/web run build      → pass
```

## 12. Files changed

| File | Purpose |
|------|---------|
| `lib/auth/siws-message.ts` | SIWS message build/parse |
| `lib/auth/siws-address.ts` | Base58 public-key check |
| `lib/auth/siws-verify.ts` | Server ed25519 verification |
| `lib/auth/siws-session-client.ts` | Browser sign-in + verify |
| `app/api/auth/siws/route.ts` | Verify route + session cookie |
| `lib/auth/session.ts` | SIWS session seal; EVM sessions gain namespace/authMethod |
| `app/api/auth/session/route.ts` | Returns namespace + authMethod |
| `ScoopAuthSheet.tsx` | Solana connect then SIWS before close |
| `wallet-session.ts` / `use-scoop-wallet-session.ts` | Auth snapshot + provider readiness |
| `WalletSlotLive.tsx` | Chrome from authenticated session for both namespaces |
| `AccountPageLive.tsx` | Shared layout; Solana modules unavailable |
| `rail-compatibility.ts` / `LaunchFlowLive.tsx` | Launch requires SIWE or SIWS |
| tests listed above | |
| `apps/web/package.json` + lockfile | `tweetnacl`, `bs58` |

## 13. Production deploy

- SHA: recorded after push
- Vercel deployment ID: pending dashboard
- status: awaiting human SIWS verification on https://scoop.fun

## 14. Human verification

### EVM
- SIWE works: —
- account UI normal: —
- PONS allowed: —
- Pump blocked: —

### Solana
- Phantom opens: —
- SIWS request occurs: —
- SIWS approved: —
- SCOOP authenticated session established: —
- same `/account` layout shown: —
- Solana address correct: —
- Pump allowed: —
- PONS blocked: —
- sign out works: —

## 15. Production actions

- Vercel changed: YES (deploy from `main`)
- Render changed: NO
- Pump worker enabled: NO
- PumpPortal changed: NO
- Supabase changed: NO
- RHC changed: NO
- blockchain transaction broadcast: NO
- secrets exposed: NO

## 16. Exact next step

After human SIWE + SIWS verification:

`NEXT STEP: ADD SOL-DENOMINATED DEV BUY TO THE PUMP LAUNCH FLOW, THEN RUN THE FIRST SCNY CREATE + BUY CANARY.`
