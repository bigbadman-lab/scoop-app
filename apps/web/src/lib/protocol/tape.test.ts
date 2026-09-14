import { describe, expect, it } from 'vitest';
import { resolveTapeTokenAddress } from '@/lib/protocol/tape';

describe('resolveTapeTokenAddress', () => {
  it('returns null when unset', () => {
    expect(resolveTapeTokenAddress({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      resolveTapeTokenAddress({
        NEXT_PUBLIC_TAPE_TOKEN_ADDRESS: '',
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it('returns null for invalid addresses', () => {
    expect(
      resolveTapeTokenAddress({
        NEXT_PUBLIC_TAPE_TOKEN_ADDRESS: 'not-an-address',
      } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(
      resolveTapeTokenAddress({
        NEXT_PUBLIC_TAPE_TOKEN_ADDRESS: '0x0',
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it('checksums a valid configured address', () => {
    const addr = resolveTapeTokenAddress({
      NEXT_PUBLIC_TAPE_TOKEN_ADDRESS: '0x4b227d5e6199f42cea4e638875ff8c740757dd3c',
    } as NodeJS.ProcessEnv);
    expect(addr).toBe('0x4B227d5E6199f42ceA4e638875fF8C740757DD3C');
  });
});
