import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOLDER_REWARDS_ADVISORY_LOCK_SQL,
  isForbiddenLockSql,
} from './lock.js';

describe('holder rewards authority separation', () => {
  it('uses dedicated scoop_holder_rewards advisory lock', () => {
    expect(HOLDER_REWARDS_ADVISORY_LOCK_SQL).toBe(
      `hashtext('scoop_holder_rewards')`,
    );
    expect(isForbiddenLockSql(`hashtext('scoop_fee_keeper')`)).toBe(true);
    expect(isForbiddenLockSql(`hashtext('scoop_indexer')`)).toBe(true);
    expect(isForbiddenLockSql(HOLDER_REWARDS_ADVISORY_LOCK_SQL)).toBe(false);
  });

  it('source never reads SCOOP_FEE_KEEPER_PRIVATE_KEY for signing', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf8');
      // Config may mention the fee-keeper key only to refuse reuse.
      if (file === 'config.ts') {
        expect(text.includes('must not reuse SCOOP_FEE_KEEPER_PRIVATE_KEY')).toBe(
          true,
        );
        expect(text.includes('process.env.SCOOP_FEE_KEEPER_PRIVATE_KEY')).toBe(
          false,
        );
        continue;
      }
      expect(
        text.includes('SCOOP_FEE_KEEPER_PRIVATE_KEY'),
        `${file} must not reference fee-keeper key`,
      ).toBe(false);
      expect(text.includes("functionName: 'claim'"), `${file} claim write`).toBe(
        false,
      );
    }
  });

  it('fee-keeper still has no publishRound authority (sibling scan)', () => {
    const feeDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../fee-keeper/src',
    );
    const files = readdirSync(feeDir).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    for (const file of files) {
      const text = readFileSync(join(feeDir, file), 'utf8');
      expect(text.includes('publishRound'), file).toBe(false);
      expect(text.includes('pushBatch'), file).toBe(false);
    }
  });
});
