# Runtime $TAPE official contract update command

## 1. Verdict

**PASS — TAPE CONTRACT CAN BE UPDATED AT RUNTIME**

## 2. Pre-HEAD

`20983d1ecec32dd22a2ba9ef8196c132e97b2b09` (`feat(web): add TAPE protocol stats page`)

## 3. Contract source before change

`NEXT_PUBLIC_TAPE_TOKEN_ADDRESS` via `resolveTapeTokenAddress()` on `/protocol/tape` (build/env — required redeploy to change).

## 4. Architecture

Database-backed runtime setting + operator CLI. Live page/API read DB only (no `NEXT_PUBLIC_TAPE_TOKEN_ADDRESS`).

## 5. DB table

`protocol_settings` (`key` PK, `value`, `updated_at`). RLS enabled; no anon write policies. Operator uses `DATABASE_URL`.

## 6. DB key

`tape_official_contract`

## 7. Migration

`supabase/migrations/20260914140000_protocol_settings.sql`

**Production status:** applied (table present). Full `pnpm db:migrate` is not reliable on this DB (older migrations are not fully idempotent); this migration was applied directly.

## 8. Runtime getter

`getTapeOfficialContractAddress(db)` in `@scoop/db` (`packages/db/src/queries/protocol-settings.ts`). Returns normalized lowercase address or `null`.

## 9. TAPE page integration

`/protocol/tape` is `force-dynamic`. SSR via `loadProtocolStatsSafe()` → `tape.contractAddress`. Client `ProtocolStatsLive` polls `/api/protocol/stats` every 20s and updates the contract card.

## 10. Stats API

`GET /api/protocol/stats` includes:

```json
{ "tape": { "contractAddress": null } }
```

or a checksummed address when set.

## 11. Caching / revalidation

- Page: `dynamic = 'force-dynamic'`
- API: `revalidate = 20`, `Cache-Control: public, s-maxage=20, stale-while-revalidate=40`
- Client poll: 20s (`cache: 'no-store'`)

## 12. Expected propagation delay

**~0–20 seconds** after a successful CLI write (next client poll; soft CDN max ~20s). Soft refresh of the open tab is enough; hard reload not required. No Vercel redeploy.

## 13. CLI file

`scripts/set-tape-contract.mjs` (+ `scripts/lib/tape-contract-verify.mjs`)

## 14. Package command

```bash
pnpm tape:set-contract
```

## 15. Exact command to set official address

```bash
pnpm tape:set-contract 0xREAL_TAPE_ADDRESS --confirm
```

Requires `DATABASE_URL` and `ROBINHOOD_RPC_URL` in env or `.env.local`.

## 16. Intentional override

```bash
pnpm tape:set-contract 0xNEW_ADDRESS --confirm --override
```

## 17–20. Validation

| Check | Severity |
|-------|----------|
| Valid EVM address | hard |
| RPC chain ID `4663` | hard |
| Non-empty bytecode | hard |
| ERC-20 `symbol` / `name` / `decimals` | soft (printed) |

## 21. Idempotency

Same address already set → exit 0, “No change required.”

## 22. Overwrite protection

Different address without `--override` → abort with existing vs requested.

## 23. Credentials

`DATABASE_URL` + `ROBINHOOD_RPC_URL` from process env / `.env.local`. Secrets never printed.

## 24. Public mutation API

**None.** Read-only via existing stats API / SSR.

## 25. Tests

- `@scoop/db` protocol-settings (unset/configured/idempotent/override/invalid)
- `scripts/tape-contract-verify.test.ts` (args, normalize, wrong chain, EOA, valid)
- Web: tape checksum, stats API tape field, ProtocolStatsLive TBA / configured / poll update

## 26. Build result

`@scoop/db` build + `@scoop/web` build: **pass**

## 27. Production migration status

**Applied.** `protocol_settings` present.

## 28. Production TAPE setting status

**Unset** (`tape_official_contract` has no row). Live page remains **To be announced**. No fake address written.

## 29. Files changed

- `supabase/migrations/20260914140000_protocol_settings.sql`
- `packages/db/src/queries/protocol-settings.ts` (+ test, exports)
- `scripts/set-tape-contract.mjs`, `scripts/lib/tape-contract-verify.mjs`, tests
- `apps/web` protocol page / stats API / load-stats / ProtocolStatsLive / tape helper
- `package.json` (`tape:set-contract`)
- `.env.example` (env var no longer used for live page)

## 30. Commit

`3f8e1ef` — `feat(web): add runtime TAPE contract configuration`

## 31. Push

Pushed to `origin/main` (`20983d1..3f8e1ef`).

## 32. Vercel deployment

Production Ready: `dpl_4kbt7R5GSSsqfejMJMoSrwZ6dwFW`  
`https://scoop-k0odahdyg-cope2.vercel.app` → `https://scoop.fun`

Live API includes `"tape":{"contractAddress":null}`; page shows **To be announced**.

## 33. Final HEAD

`3f8e1efa036d16ec6b460311adeda1d00e0f686b`

## 34. `git status --short`

Clean for feature files; unrelated untracked audit/P10.4 reports remain.

## 35. Post-launch operator steps

1. Launch `$TAPE` on Robinhood Chain (separate process — not this command).
2. From repo root with production operator env:

```bash
pnpm tape:set-contract 0xREAL_TAPE_ADDRESS --confirm
```

3. Expect success lines:

```text
TAPE official contract updated
Chain: 4663
Address: 0x...
Source: protocol_settings.tape_official_contract
```

4. Open `https://scoop.fun/protocol/tape` — within ~20s the official contract replaces TBA (poll or soft refresh).
5. If already set to the same address: no-op.
6. Emergency replace: add `--override`.

---

**After `$TAPE` launches, its official contract address can be published to the live SCOOP protocol page with one operator command and no Vercel deployment.**
