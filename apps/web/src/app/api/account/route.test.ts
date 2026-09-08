import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthenticatedScoopUser = vi.fn();
const getScoopAccountBundle = vi.fn();
const updateScoopDisplayName = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedScoopUser: (...args: unknown[]) => getAuthenticatedScoopUser(...args),
}));

vi.mock('@/lib/server/db', () => ({
  getServerPool: () => ({}),
}));

vi.mock('@scoop/db', async () => {
  const actual = await vi.importActual<typeof import('@scoop/db')>('@scoop/db');
  return {
    ...actual,
    getScoopAccountBundle: (...args: unknown[]) => getScoopAccountBundle(...args),
    updateScoopDisplayName: (...args: unknown[]) => updateScoopDisplayName(...args),
  };
});

vi.mock('@/lib/account/avatar-storage', () => ({
  createSupabaseProfileAvatarStorage: () => ({
    createSignedUrl: async () => 'https://signed.example/avatar.png',
    uploadAvatar: async () => ({ path: 'u/avatar.png' }),
  }),
  PROFILE_AVATAR_MIME: new Set(['image/png']),
  PROFILE_AVATAR_MAX_BYTES: 2_000_000,
  profileAvatarPath: (userId: string) => `${userId}/avatar.png`,
}));

import { GET } from '@/app/api/account/route';
import { PATCH } from '@/app/api/account/profile/route';

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

describe('GET /api/account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when signed out', async () => {
    getAuthenticatedScoopUser.mockReturnValue(null);
    const res = await GET(new Request('http://localhost/api/account'));
    expect(res.status).toBe(401);
  });

  it('loads the session user account and keeps fee lanes separate', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER_A,
      address: ADDR_A,
      chainId: 4663,
    });
    getScoopAccountBundle.mockResolvedValue({
      user: {
        userId: USER_A,
        displayName: 'Ada',
        avatarPath: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        joinedAt: '2026-09-01T00:00:00.000Z',
        status: 'active',
      },
      wallet: {
        address: ADDR_A,
        walletType: 'external',
        provider: 'injected',
        isPrimary: true,
      },
      tokensLaunched: [],
      fees: {
        deployer: {
          label: 'deployer',
          assets: [
            {
              assetKind: 'eth',
              assetAddress: '0x0000000000000000000000000000000000000000',
              symbol: 'ETH',
              amountRaw: '1',
              amountDisplay: '0.000000000000000001',
            },
          ],
        },
        creator: { label: 'creator', assets: [] },
      },
    });

    const res = await GET(new Request('http://localhost/api/account'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.id).toBe(USER_A);
    expect(body.fees.deployer.empty).toBe(false);
    expect(body.fees.creator.empty).toBe(true);
    expect(body.fees.deployer.assets[0].claimableRaw).toBeUndefined();
  });

  it('rejects session/user mismatch', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER_A,
      address: ADDR_A,
      chainId: 4663,
    });
    getScoopAccountBundle.mockResolvedValue({
      user: {
        userId: USER_B,
        displayName: null,
        avatarPath: null,
        createdAt: '2026-09-01T00:00:00.000Z',
        joinedAt: '2026-09-01T00:00:00.000Z',
        status: 'active',
      },
      wallet: {
        address: ADDR_A,
        walletType: 'external',
        provider: 'unknown',
        isPrimary: true,
      },
      tokensLaunched: [],
      fees: {
        deployer: { label: 'deployer', assets: [] },
        creator: { label: 'creator', assets: [] },
      },
    });
    const res = await GET(new Request('http://localhost/api/account'));
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/account/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects client-supplied userId', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER_A,
      address: ADDR_A,
      chainId: 4663,
    });
    const res = await PATCH(
      new Request('http://localhost/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'X', userId: USER_B }),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateScoopDisplayName).not.toHaveBeenCalled();
  });

  it('updates display name for the session user only', async () => {
    getAuthenticatedScoopUser.mockReturnValue({
      userId: USER_A,
      address: ADDR_A,
      chainId: 4663,
    });
    updateScoopDisplayName.mockResolvedValue({
      userId: USER_A,
      displayName: 'Desk',
      avatarPath: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      joinedAt: '2026-09-01T00:00:00.000Z',
      status: 'active',
    });
    const res = await PATCH(
      new Request('http://localhost/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Desk' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateScoopDisplayName).toHaveBeenCalledWith({}, USER_A, 'Desk');
  });
});
