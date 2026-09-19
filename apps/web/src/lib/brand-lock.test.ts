import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCOOP_AVATAR_SRC, SCOOP_GREEN, SCOOP_MARK_SRC } from '@/lib/brand';

const SRC = join(process.cwd(), 'src');
const FORBIDDEN = ['#FC4C00', '#fc4c00', '--scoop-orange', 'SCOOP_ORANGE'] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
      continue;
    }
    if (/\.(tsx?|css)$/.test(name) && name !== 'brand-lock.test.ts') {
      out.push(path);
    }
  }
  return out;
}

describe('SCOOP green brand lock', () => {
  it('keeps the canonical green, mark, and signed-out avatar on one asset', () => {
    expect(SCOOP_GREEN).toBe('#015225');
    expect(SCOOP_MARK_SRC).toBe('/brand/logogreen.png');
    expect(SCOOP_AVATAR_SRC).toBe(SCOOP_MARK_SRC);
  });

  it('has no live legacy orange brand tokens in app source', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const token of FORBIDDEN) {
        if (text.includes(token)) hits.push(`${file} ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
