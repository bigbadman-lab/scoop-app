import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedScoopUser = vi.fn();
const listHolderRewardEntitlementsForAccount = vi.fn();
const getServerPool = vi.fn(() => ({}));

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedScoopUser: (...args: unknown[]) => getAuthenticatedScoopUser(...args),
}));

vi.mock('@/lib/server/db', () => ({
  getServerPool: () => getServerPool(),
}));

vi.mock('@scoop/db', async () => {
  const actual = await vi.importActual<typeof import('@scoop/db')>('@scoop/db');
  return {
    ...actual,
    listHolderRewardEntitlementsForAccount: (...args: unknown[]) =>
      listHolderRewardEntitlementsForAccount(...args),
  };
});

import { GET } from '@/app/api/account/holder-rewards/route';
import { loadAuthenticatedHolderRewards } from '@/lib/account/load-holder-rewards';

const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('holder rewards API gating + auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED;
  });

  it('returns 401 when signed out', async () => {
    getAuthenticatedScoopUser.mockReturnValue(null);
    const res = await GET(new Request('http://localhost/api/account/holder-rewards'));
    expect(res.status).toBe(401);
    expect(listHolderRewardEntitlementsForAccount).not.toHaveBeenCalled();
  });

  it('disabled gate does not execute P8 DB query', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER,
      address: ADDR,
      chainId: 4663,
    });
    const result = await loadAuthenticatedHolderRewards(
      new Request('http://localhost/api/account/holder-rewards'),
      {},
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.enabled).toBe(false);
    expect(result.body.account).toBe(ADDR);
    expect(result.body.entitlements).toEqual([]);
    expect(listHolderRewardEntitlementsForAccount).not.toHaveBeenCalled();
    expect(getServerPool).not.toHaveBeenCalled();
  });

  it('authenticated enabled request uses session address only', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER,
      address: ADDR,
      chainId: 4663,
    });
    listHolderRewardEntitlementsForAccount.mockResolvedValue([]);

    const res = await GET(
      new Request(
        `http://localhost/api/account/holder-rewards?account=${OTHER}`,
      ),
    );
    expect(res.status).toBe(200);
    // Gate still off by default — even with query param, no DB call.
    expect(listHolderRewardEntitlementsForAccount).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.account).toBe(ADDR);
  });

  it('when enabled, queries session address and ignores client account override', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER,
      address: ADDR,
      chainId: 4663,
    });
    listHolderRewardEntitlementsForAccount.mockResolvedValue([]);

    const result = await loadAuthenticatedHolderRewards(
      new Request(
        `http://localhost/api/account/holder-rewards?account=${OTHER}`,
      ),
      { SCOOP_HOLDER_REWARDS_ACCOUNT_ENABLED: '1' },
    );

    expect(result.ok).toBe(true);
    expect(listHolderRewardEntitlementsForAccount).toHaveBeenCalledWith(
      {},
      { chainId: 4663, account: ADDR },
    );
    expect(listHolderRewardEntitlementsForAccount.mock.calls[0]?.[1]?.account).not.toBe(
      OTHER,
    );
  });
});
