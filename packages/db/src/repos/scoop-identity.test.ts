import { describe, expect, it, vi } from 'vitest';
import {
  findScoopUserByWalletAddress,
  resolveOrCreateScoopUserForVerifiedWallet,
} from './scoop-identity.js';
import type { Pool, Queryable } from '../types.js';

const ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ADDRESS_LOWER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const WALLET_ID = '22222222-2222-2222-2222-222222222222';

vi.mock('../client.js', () => ({
  withTransaction: async <T>(
    _pool: Pool,
    fn: (client: Queryable) => Promise<T>,
  ): Promise<T> => fn(_pool as unknown as Queryable),
}));

function mockPool(handlers: Array<(text: string, params?: unknown[]) => unknown>): Pool {
  let i = 0;
  return {
    query: vi.fn(async (text: string, params?: unknown[]) => {
      const handler = handlers[i++];
      if (!handler) {
        throw new Error(`Unexpected query #${i}: ${text}`);
      }
      return handler(text, params);
    }),
  } as unknown as Pool;
}

describe('resolveOrCreateScoopUserForVerifiedWallet', () => {
  it('creates user + primary wallet + profile on first login', async () => {
    const pool = mockPool([
      () => ({ rows: [] }),
      () => ({ rows: [{ id: USER_ID, status: 'active' }] }),
      (_text, params) => {
        expect(params?.[1]).toBe(ADDRESS_LOWER);
        expect(params?.[2]).toBe('external');
        return {
          rows: [
            {
              id: WALLET_ID,
              wallet_type: 'external',
              is_primary: true,
              address: ADDRESS_LOWER,
            },
          ],
        };
      },
      () => ({ rows: [] }),
    ]);

    const user = await resolveOrCreateScoopUserForVerifiedWallet(pool, {
      address: ADDRESS,
    });
    expect(user).toEqual({
      userId: USER_ID,
      status: 'active',
      address: ADDRESS_LOWER,
      walletId: WALLET_ID,
      walletType: 'external',
      isPrimary: true,
    });
    expect(pool.query).toHaveBeenCalledTimes(4);
  });

  it('resolves the same user on repeat login and touches last_seen_at', async () => {
    const pool = mockPool([
      () => ({
        rows: [
          {
            user_id: USER_ID,
            status: 'active',
            wallet_id: WALLET_ID,
            wallet_type: 'external',
            is_primary: true,
            address: ADDRESS_LOWER,
          },
        ],
      }),
      (_text, params) => {
        expect(params?.[0]).toBe(WALLET_ID);
        return { rows: [] };
      },
    ]);

    const user = await resolveOrCreateScoopUserForVerifiedWallet(pool, {
      address: ADDRESS_LOWER,
    });
    expect(user.userId).toBe(USER_ID);
    expect(pool.query).toHaveBeenCalledTimes(2);
  });

  it('normalizes mixed-case addresses before lookup', async () => {
    const pool = mockPool([
      (_text, params) => {
        expect(params?.[0]).toBe(ADDRESS_LOWER);
        return {
          rows: [
            {
              user_id: USER_ID,
              status: 'active',
              wallet_id: WALLET_ID,
              wallet_type: 'external',
              is_primary: true,
              address: ADDRESS_LOWER,
            },
          ],
        };
      },
      () => ({ rows: [] }),
    ]);

    await resolveOrCreateScoopUserForVerifiedWallet(pool, { address: ADDRESS });
  });

  it('recovers from unique address races without duplicating users', async () => {
    const uniqueError = Object.assign(new Error('duplicate'), { code: '23505' });
    const pool = mockPool([
      () => ({ rows: [] }),
      () => ({ rows: [{ id: USER_ID, status: 'active' }] }),
      () => {
        throw uniqueError;
      },
      // Second withTransaction after race
      () => ({
        rows: [
          {
            user_id: USER_ID,
            status: 'active',
            wallet_id: WALLET_ID,
            wallet_type: 'external',
            is_primary: true,
            address: ADDRESS_LOWER,
          },
        ],
      }),
      () => ({ rows: [] }),
    ]);

    const user = await resolveOrCreateScoopUserForVerifiedWallet(pool, {
      address: ADDRESS,
    });
    expect(user.userId).toBe(USER_ID);
    expect(user.walletId).toBe(WALLET_ID);
  });

  it('rejects disabled users', async () => {
    const pool = mockPool([
      () => ({
        rows: [
          {
            user_id: USER_ID,
            status: 'disabled',
            wallet_id: WALLET_ID,
            wallet_type: 'external',
            is_primary: true,
            address: ADDRESS_LOWER,
          },
        ],
      }),
    ]);

    await expect(
      resolveOrCreateScoopUserForVerifiedWallet(pool, { address: ADDRESS }),
    ).rejects.toThrow('SCOOP_USER_DISABLED');
  });
});

describe('findScoopUserByWalletAddress', () => {
  it('returns null when no wallet exists', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
    } as unknown as Queryable;
    await expect(findScoopUserByWalletAddress(db, ADDRESS)).resolves.toBeNull();
  });
});
