# Supabase migrations

Owned by `scoop-app`.

## Status (Phase 6A.5)

Executable HELLO vertical-slice schema:

- `20260906140000_phase_6a5_hello_schema.sql`

Apply locally:

```bash
pnpm db:migrate
```

The migrator loads `DATABASE_URL` from the environment or `.env.local`, prints migration **filenames only**, and never echoes the connection string.

## Notes

- Seeds Robinhood Chain `4663` protocol contracts / quote asset / address classifications
- No auth schema changes
- Do not point at production until HELLO verify passes
