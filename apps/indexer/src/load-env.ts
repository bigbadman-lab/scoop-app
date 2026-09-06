import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load root `.env.local` into process.env without overriding existing values.
 * Never logs values.
 */
export function loadLocalEnv(rootDir = process.cwd()): void {
  const path = join(rootDir, '.env.local');
  if (!existsSync(path)) {
    // Try monorepo root when cwd is apps/indexer
    const alt = join(rootDir, '../../.env.local');
    if (existsSync(alt)) {
      applyEnvFile(alt);
    }
    return;
  }
  applyEnvFile(path);
}

function applyEnvFile(path: string): void {
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}
