import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load monorepo root `.env.local` into process.env without overriding set values.
 * Never logs values.
 */
export function loadLocalEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '../../.env.local'),
    join(here, '../../../.env.local'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      applyEnvFile(path);
      return;
    }
  }
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
