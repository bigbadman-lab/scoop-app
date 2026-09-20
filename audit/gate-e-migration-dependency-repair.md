# Gate E Migration — Dependency Repair

## Verdict

`PASS — GATE E MIGRATION DEPENDENCY REPAIR READY TO APPLY`

---

## Dependency tree

Confirmed via production read-only `pg_depend` / `pg_get_viewdef` (2026-09-21). No CASCADE used.

```text
public_token_detail
  └── public_token_discovery
        ├── launches (token_address, creator_id, quote_asset, factory_address, …)
        ├── tokens (token_address, deployer_address, display_image_url, …)
        └── token_market_state (token_address, …)

launch_discovery
  ├── launches (token_address, creator_id, quote_asset, …)
  └── token_market_state (token_address, …)
```

### Objects audited (widened columns)

| Object | Finding |
|--------|---------|
| Views | `public_token_detail`, `public_token_discovery`, `launch_discovery` |
| Materialized views | none |
| Rules (non-`_RETURN`) | none |
| Triggers (user) | none on `tokens` / `launches` / `token_market_state` |
| Functions (public deps) | none |
| RLS policies | `tokens_select_anon`, `launches_select_anon`, `market_select_anon` — table policies; **not** dropped; survive ALTER TYPE |
| Indexes / PKs | remain; PG rebuilds indexes on TYPE change. New Gate E unique index still created |
| View options | empty `reloptions` (no `security_invoker` / `security_barrier`) |
| Owners | `postgres` for all three views |

`launch_tx_hash` / `curve_address` / `launch_factory_address` have **no** view dependents, but are still widened as in original Gate E.

App discovery SQL in `@scoop/db` queries base tables directly; views are optional public consumers and must still be preserved.

---

## Exact objects dropped / recreated

**Drop order (no CASCADE):**

1. `public.public_token_detail`
2. `public.public_token_discovery`
3. `public.launch_discovery`

**Recreate order:**

1. `public.launch_discovery` — production body (7d / GUC-aware NEW window)
2. `public.public_token_discovery` — production body (includes `display_image_url`, 604800 `is_new`)
3. `public.public_token_detail` — production body (`d.*` expanded to explicit columns matching live `pg_get_viewdef`)

---

## Migration changes made

Patched in place: `supabase/migrations/20260920230000_gate_e_solana_pump_markets.sql`

1. `BEGIN`
2. Drop three dependent views (explicit, no CASCADE)
3. All original Gate E DDL retained:
   - `chains.chain_family` + Solana `900001` seed
   - CHAR → TEXT widen on tokens / launches / `token_market_state`
   - `market_source` includes `pump`
   - fee CHECK allows 0 for `pons_v2` / `pump`
   - `launches_pump_launch_tx_hash_unique`
   - `chains_chain_family_idx`
4. Recreate views from production definitions
5. Restore `GRANT ALL PRIVILEGES`
6. `COMMIT`

No new migration file. No app/worker/env changes. Migration **not** applied.

---

## Privileges restored

```sql
GRANT ALL PRIVILEGES ON TABLE public.launch_discovery
  TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.public_token_discovery
  TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON TABLE public.public_token_detail
  TO anon, authenticated, service_role;
```

Matches live production grants (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for those roles).

---

## Ownership / security options preserved

- No view `reloptions` to restore (production had none)
- Ownership will be the role that runs the migration (normally equivalent to current `postgres` owner in Supabase)
- RLS policies on base tables untouched

---

## Safety findings

| Check | Result |
|-------|--------|
| Destructive data rewrite | None — `USING col::TEXT` is widen-only |
| Truncation risk | None — TEXT ≥ CHAR(n) |
| Existing Robinhood rows | Remain valid; CHECK still allows `scoop` fee shape |
| Indexes / constraints lost | No — ALTER TYPE keeps PK/indexes; Gate E indexes use `IF NOT EXISTS` |
| View ↔ app compatibility | View column sets unchanged vs production |
| Privileges restored | Yes (ALL to anon / authenticated / service_role) |
| Idempotency | One-shot migration sense: `IF NOT EXISTS` / `DROP IF EXISTS` / `ON CONFLICT` for additive bits; re-run after success would fail on already-TEXT columns (normal) |
| CASCADE | Not used |
| Production apply this task | Not performed |

---

## Final apply instructions

1. Review patched file: `supabase/migrations/20260920230000_gate_e_solana_pump_markets.sql`
2. Confirm Gate E migration has **not** already been partially applied without view drops
3. Apply once via your normal Supabase migration path (e.g. `supabase db push` or SQL editor running the file inside its own transaction)
4. Post-apply smoke:
   - `\d+ public.public_token_discovery` / `public_token_detail` / `launch_discovery`
   - `SELECT attname, format_type(atttypid, atttypmod) FROM pg_attribute …` for `tokens.token_address` → `text`
   - `SELECT * FROM public.public_token_discovery LIMIT 1;`
   - Confirm grants for `anon` / `authenticated` / `service_role`
5. Then proceed with Pump persist / Gate G readiness

Do not begin Gate G from this repair task.
