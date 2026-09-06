import { describe, expect, it, vi } from 'vitest';
import { assertMigrationCompatibility, INDEXER_ADVISORY_LOCK_SQL } from './guardrails.js';

describe('indexer guardrails', () => {
  it('uses fixed hashtext advisory lock expression', () => {
    expect(INDEXER_ADVISORY_LOCK_SQL).toContain("hashtext('scoop_indexer')");
  });

  it('passes when launch_progress_bps column exists', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [{ ok: 1 }] })),
    };
    await expect(assertMigrationCompatibility(db as never)).resolves.toBeUndefined();
  });

  it('fails clearly when column missing', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    await expect(assertMigrationCompatibility(db as never)).rejects.toThrow(
      /launch_progress_bps/,
    );
  });
});
