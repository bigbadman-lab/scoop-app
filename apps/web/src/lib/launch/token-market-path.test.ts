import { describe, expect, it } from 'vitest';
import { tokenMarketPath } from '@/lib/launch/tx-state';

describe('tokenMarketPath', () => {
  it('uses canonical /token/[address] route key', () => {
    expect(
      tokenMarketPath('0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa'),
    ).toBe('/token/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  });
});
