import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveVerifiedWalletIdentity } from '@/lib/auth/identity';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const ADDRESS_LOWER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

const resolveOrCreate = vi.fn();
const getServerPool = vi.fn(() => ({ tag: 'pool' }));

vi.mock('@scoop/db', () => ({
  resolveOrCreateScoopUserForVerifiedWallet: (...args: unknown[]) =>
    resolveOrCreate(...args),
}));

vi.mock('@/lib/server/db', () => ({
  getServerPool: () => getServerPool(),
}));

afterEach(() => {
  resolveOrCreate.mockReset();
  getServerPool.mockClear();
});

describe('resolveVerifiedWalletIdentity', () => {
  it('rejects non-Robinhood chain ids', async () => {
    await expect(
      resolveVerifiedWalletIdentity({ address: ADDRESS, chainId: 1 }),
    ).rejects.toThrow('UNSUPPORTED_CHAIN');
    expect(resolveOrCreate).not.toHaveBeenCalled();
  });

  it('rejects invalid addresses', async () => {
    await expect(
      resolveVerifiedWalletIdentity({ address: 'not-an-address', chainId: 4663 }),
    ).rejects.toThrow('INVALID_ADDRESS');
  });

  it('resolves via DB using normalized SIWE address only', async () => {
    resolveOrCreate.mockResolvedValue({
      userId: USER_ID,
      status: 'active',
      address: ADDRESS_LOWER,
      walletId: '22222222-2222-4222-8222-222222222222',
      walletType: 'external',
      isPrimary: true,
    });

    const user = await resolveVerifiedWalletIdentity({
      address: ADDRESS,
      chainId: 4663,
    });

    expect(user.userId).toBe(USER_ID);
    expect(resolveOrCreate).toHaveBeenCalledWith(
      { tag: 'pool' },
      { address: ADDRESS_LOWER, walletType: undefined, provider: undefined },
    );
  });

  it('repeat resolve returns the same userId for the same wallet', async () => {
    resolveOrCreate.mockResolvedValue({
      userId: USER_ID,
      status: 'active',
      address: ADDRESS_LOWER,
      walletId: '22222222-2222-4222-8222-222222222222',
      walletType: 'external',
      isPrimary: true,
    });

    const first = await resolveVerifiedWalletIdentity({
      address: ADDRESS,
      chainId: 4663,
    });
    const second = await resolveVerifiedWalletIdentity({
      address: ADDRESS_LOWER,
      chainId: 4663,
    });
    expect(first.userId).toBe(USER_ID);
    expect(second.userId).toBe(first.userId);
    expect(resolveOrCreate).toHaveBeenCalledTimes(2);
  });
});
