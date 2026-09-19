import { describe, expect, it } from 'vitest';
import {
  HIDDEN_PRODUCTION_CANARY_SQL,
  HIDDEN_PRODUCTION_CANARY_TOKENS,
  isHiddenProductionCanary,
} from './hidden-production-canaries.js';

describe('hidden production canaries', () => {
  it('recognizes S5FA/S5FB/S5FC case-insensitively', () => {
    expect(
      isHiddenProductionCanary('0x48f91579D27d044681098eB4E5B4B92B3F83Ef7D'),
    ).toBe(true);
    expect(
      isHiddenProductionCanary('0x6509630F521Bcf07dD69c38FD80882852ae5Fdc5'),
    ).toBe(true);
    expect(
      isHiddenProductionCanary('0x9903AA6646D1BB29bB584724e66c42a5cd318814'),
    ).toBe(true);
    expect(
      isHiddenProductionCanary('0x5D7493B2d151d35cbe172c10713bf50b83e58392'),
    ).toBe(true);
  });

  it('does not hide a normal non-listed address', () => {
    expect(
      isHiddenProductionCanary('0x1111111111111111111111111111111111111111'),
    ).toBe(false);
    expect(HIDDEN_PRODUCTION_CANARY_SQL).not.toContain(
      '0x1111111111111111111111111111111111111111',
    );
  });

  it('exposes exactly four normalized hidden addresses', () => {
    expect(HIDDEN_PRODUCTION_CANARY_TOKENS).toHaveLength(4);
    for (const addr of HIDDEN_PRODUCTION_CANARY_TOKENS) {
      expect(addr).toBe(addr.toLowerCase());
      expect(isHiddenProductionCanary(addr)).toBe(true);
    }
  });

  it('SQL fragment lists every hidden address', () => {
    for (const addr of HIDDEN_PRODUCTION_CANARY_TOKENS) {
      expect(HIDDEN_PRODUCTION_CANARY_SQL).toContain(addr);
    }
    expect(HIDDEN_PRODUCTION_CANARY_SQL).toMatch(/NOT IN/i);
  });
});
