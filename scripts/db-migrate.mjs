/**
 * Load DATABASE_URL from .env.local (or process env) and apply supabase/migrations/*.sql in order.
 * Prints migration filenames only — never prints the connection URL or secrets.
 *
 * Usage: node scripts/db-migrate.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const fileEnv = loadEnvFile(join(root, '.env.local'));
const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is missing (set in environment or .env.local)');
  process.exit(1);
}

const migrationsDir = join(root, 'supabase', 'migrations');
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('No .sql files found in supabase/migrations');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    console.log(`Applying ${file}`);
    await client.query(sql);
  }
  console.log(`Applied ${files.length} migration(s)`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // Never echo connection strings that may appear in driver errors
  console.error('Migration failed:', message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://***'));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
