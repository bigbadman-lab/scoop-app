import { describe, expect, it } from 'vitest';
import { createPool, getToken } from '../index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HELLO_TOKEN = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
const HELLO_POOL = '0xe9ee30525faa467bcc5742f330a47c7d516a56a06f6fd9b302a8599f344f5abc';
const HELLO_CREATOR_ID =
  '0xffcbd42160aa8079474ac1074616a9c5f6e1e73a422c5a596a2f2cc978fa39ef';

function loadEnvLocal(): void {
  const candidates = [
    resolve(process.cwd(), '../../.env.local'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../../../.env.local'),
  ];
  const file = candidates.find((p) => existsSync(p)) ?? null;
  if (!file) return;
  const text = readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadEnvLocal();

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('HELLO product query acceptance (live DATABASE_URL)', () => {
  it('getToken returns HELLO name/symbol/pool/creatorId', async () => {
    const pool = createPool(process.env.DATABASE_URL!);
    try {
      try {
        await pool.query('SELECT 1');
      } catch (error) {
        console.warn(
          'Skipping HELLO acceptance: DATABASE_URL set but unreachable —',
          error instanceof Error ? error.message : String(error),
        );
        return;
      }

      const token = await getToken(pool, 4663, HELLO_TOKEN);
      expect(token).not.toBeNull();
      expect(token!.name).toBe('Hello World');
      expect(token!.symbol).toBe('HELLO');
      expect(token!.poolId).toBe(HELLO_POOL);
      expect(token!.creatorId).toBe(HELLO_CREATOR_ID);
      expect(token!.tokenAddress).toBe(HELLO_TOKEN);
    } finally {
      await pool.end();
    }
  });
});
