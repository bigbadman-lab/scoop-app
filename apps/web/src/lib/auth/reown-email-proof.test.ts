import { describe, expect, it } from 'vitest';
import { isScoopReownEmailProofEnabled } from '@/lib/auth/reown-email-proof';
import {
  ROBINHOOD_CAIP_NETWORK_ID,
  buildRobinhoodCustomRpcUrls,
} from '@/lib/auth/reown-rpc';

describe('C.3-proof gates', () => {
  it('email proof flag requires exact NEXT_PUBLIC value 1', () => {
    expect(
      isScoopReownEmailProofEnabled({
        NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      isScoopReownEmailProofEnabled({
        NEXT_PUBLIC_SCOOP_REOWN_EMAIL_PROOF: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(isScoopReownEmailProofEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it('builds Robinhood customRpcUrls for AppKit 1.8.23', () => {
    const urls = buildRobinhoodCustomRpcUrls({
      NEXT_PUBLIC_ROBINHOOD_RPC_URL: 'https://example-rpc.test',
    } as NodeJS.ProcessEnv);
    expect(ROBINHOOD_CAIP_NETWORK_ID).toBe('eip155:4663');
    expect(urls['eip155:4663']).toEqual([{ url: 'https://example-rpc.test' }]);
  });
});
