# Official $TAPE — local environment checklist

Gate 0 audit. **Never store secret values in this file.**

Expected deployer / support wallet (public):

```text
44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27
```

---

## Variables

| Variable | Purpose | Consumed by | Required READ | Required WRITE (lock/import) | Secret? | Present (this machine) | How operator sets |
|----------|---------|-------------|----------------|------------------------------|---------|------------------------|-------------------|
| `DATABASE_URL` | Production Postgres | `official:finalize`, import, official config, watchlist verify | YES | YES | YES | **PRESENT** | Local `.env.local` / `apps/web/.env.local` only |
| `SOLANA_RPC_URL` | Alchemy Solana mainnet HTTPS RPC | Pump preflight, balances, Streamflow client, verify | YES | YES | YES (may embed key) | **PRESENT** | Local env; same Alchemy mainnet URL used by workers |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for `token-image` mirror | `ensureTokenDisplayImageFromIpfs` / token-image-storage | YES (image) | YES (image write) | NO (public URL) | **PRESENT** | Local env (also used by web) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server storage credential for image mirror | `packages/news` token-image-storage | YES (image) | YES (image write) | YES | **PRESENT** | Local env only — never Vercel client bundle |
| `SUPABASE_URL` | Optional alias for Supabase URL | Import CLI may propagate; mirror prefers `NEXT_PUBLIC_SUPABASE_URL` | NO | NO | NO | optional | Not required if `NEXT_PUBLIC_SUPABASE_URL` set |
| `SUPABASE_SECRET_KEY` | Propagated by canary CLI only | **Unused** by mirror code | NO | NO | YES | n/a | Do not rely on this name |
| `SOLANA_KEYPAIR_PATH` | Absolute path to local deployer keypair JSON (byte array) | `official:finalize` signer load | YES (lock) | YES (lock broadcast) | Path is local; **file is secret** | **MISSING** | `export SOLANA_KEYPAIR_PATH=/absolute/path/to/keypair.json` — file stays on disk; never paste secret into `.env` |
| Streamflow API key | — | Not used by `@streamflow/stream` 13.x direct Solana client | NO | NO | — | n/a | **Do not invent** `STREAMFLOW_API_KEY` |

### Explicitly NOT used for this Solana sequence

| Variable | Why irrelevant |
|----------|----------------|
| `TAPE_TGE_SIGNER_PRIVATE_KEY` | RHC / EVM HoodLock TGE only |
| `NEXT_PUBLIC_TAPE_TOKEN_ADDRESS` | Deprecated; RHC contract lives in DB `tape_official_contract` |
| `SCOOP_FEE_KEEPER_PRIVATE_KEY` / holder-rewards keys | Unrelated workers |

---

## Signer rules

1. Prefer `SOLANA_KEYPAIR_PATH` pointing at a **local** Solana keypair JSON.
2. Derived public key **must** equal `44tkTKCk1wRUZuFkqnS8AE6wAJBAn26f6i6xxLzU3X27`.
3. Never print, commit, upload, or put the key material in Vercel/Render/DB.
4. If the deployer exists only in Phantom with no safe local keypair:

```text
BLOCKED — SAFE LOCAL DEPLOYER SIGNER NOT AVAILABLE
```

Do not export a seed phrase. Browser signer would be a separate implementation.

---

## Streamflow

- Package: `@streamflow/stream@13.4.0` (install for finalize tooling).
- Client: `SolanaStreamClient` / `createLock` + `buildLockParams` with `{ recipient, tokenId, amount, unlockDate, name }`.
- Uses existing `SOLANA_RPC_URL` + local `Keypair` — **no API key**.
- Token-lock dust: Streamflow app criteria leave **1 raw unit** releasing 1s after cliff (`cliffAmount = amount - 1`). Product language: **full economically meaningful dev allocation** — never claim literal 100% if residue exists.

---

## Gate 0 status (this workstation)

```text
OFFICIAL TAPE LOCAL ENV AUDIT

DATABASE_URL:                 PRESENT
SOLANA_RPC_URL:               PRESENT
NEXT_PUBLIC_SUPABASE_URL:     PRESENT
SUPABASE_SERVICE_ROLE_KEY:    PRESENT
SOLANA_KEYPAIR_PATH:          MISSING
Streamflow API key required:  NO

RPC network:                  MAINNET (Alchemy-like host)
Signer public key:            MISSING
```

**Gate 0E:** required lock capability missing → **STOP** (no import, no lock, no official config mutation) until `SOLANA_KEYPAIR_PATH` is set and pubkey matches.

Also required at runtime (not an env var): operator-supplied `--mint <REAL_TAPE_MINT>` — never fabricated.
