import { describe, expect, it, vi } from 'vitest';
import { getActiveMarkets, getToken, getTokens } from './tokens.js';
import { HIDDEN_PRODUCTION_CANARY_TOKENS } from './hidden-production-canaries.js';

function mockDb(rows: unknown[] = []) {
  return {
    query: vi.fn(async () => ({ rows })),
  };
}

describe('discovery canary exclusion', () => {
  it('excludes hidden tokens including $TAPE from getActiveMarkets SQL', async () => {
    const db = mockDb([]);
    await getActiveMarkets(db as never, { chainId: 4663 });
    const [sql] = db.query.mock.calls[0]!;
    const text = String(sql);
    for (const addr of HIDDEN_PRODUCTION_CANARY_TOKENS) {
      expect(text).toContain(addr);
    }
    expect(text).toMatch(/NOT IN/i);
  });

  it('excludes canaries from getTokens list SQL', async () => {
    const db = mockDb([]);
    await getTokens(db as never, { chainId: 4663, filter: 'all', sort: 'newest' });
    const [sql] = db.query.mock.calls[0]!;
    expect(String(sql)).toMatch(/NOT IN/i);
    expect(String(sql)).toContain(HIDDEN_PRODUCTION_CANARY_TOKENS[2]);
  });

  it('does not exclude hidden tokens from getToken detail lookup', async () => {
    const db = mockDb([]);
    await getToken(
      db as never,
      4663,
      '0x5D7493B2d151d35cbe172c10713bf50b83e58392',
    );
    const [sql, params] = db.query.mock.calls[0]!;
    const text = String(sql);
    expect(text).not.toMatch(/NOT IN/i);
    expect(text).toContain('l.token_address = $2');
    expect(params?.[1]).toBe('0x5d7493b2d151d35cbe172c10713bf50b83e58392');
  });
});
