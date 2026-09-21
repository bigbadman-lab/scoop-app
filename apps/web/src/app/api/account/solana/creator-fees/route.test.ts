import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getAuthenticatedAccountIdentity = vi.fn();
const readSolanaCreatorFeeSnapshot = vi.fn();
const prepareSolanaCreatorFeeClaim = vi.fn();
const getSolUsdX18 = vi.fn();
const createSolanaConnection = vi.fn();

vi.mock('@/lib/auth/session', () => ({
  getAuthenticatedAccountIdentity: (...args: unknown[]) =>
    getAuthenticatedAccountIdentity(...args),
}));

vi.mock('@/lib/account/solana-creator-fees', async () => {
  const actual = await vi.importActual<typeof import('@/lib/account/solana-creator-fees')>(
    '@/lib/account/solana-creator-fees',
  );
  return {
    ...actual,
    readSolanaCreatorFeeSnapshot: (...args: unknown[]) =>
      readSolanaCreatorFeeSnapshot(...args),
    prepareSolanaCreatorFeeClaim: (...args: unknown[]) =>
      prepareSolanaCreatorFeeClaim(...args),
  };
});

vi.mock('@/lib/market/spot', () => ({
  getSolUsdX18: (...args: unknown[]) => getSolUsdX18(...args),
}));

vi.mock('@/lib/server/db', () => ({
  getServerPool: () => ({}),
}));

vi.mock('@/lib/solana/rpc', () => ({
  createSolanaConnection: (...args: unknown[]) => createSolanaConnection(...args),
  SolanaRpcConfigError: class SolanaRpcConfigError extends Error {},
}));

import { GET } from '@/app/api/account/solana/creator-fees/route';
import { POST as PREPARE } from '@/app/api/account/solana/creator-fees/prepare/route';

const SOL = 'GJRBYe1nDVszvBDYDjT3Q7DW7fTkdHxaJbL4NvHPqF3p';
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('GET /api/account/solana/creator-fees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSolanaConnection.mockReturnValue({});
    getSolUsdX18.mockResolvedValue(150n * 10n ** 18n);
  });

  it('rejects signed-out requests', async () => {
    getAuthenticatedAccountIdentity.mockReturnValue(null);
    const res = await GET(new Request('http://localhost/api/account/solana/creator-fees'));
    expect(res.status).toBe(401);
  });

  it('rejects SIWE sessions', async () => {
    getAuthenticatedAccountIdentity.mockReturnValue({
      namespace: 'eip155',
      authMethod: 'siwe',
      userId: USER,
      address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 4663,
      issuedAt: Date.now(),
    });
    const res = await GET(new Request('http://localhost/api/account/solana/creator-fees'));
    expect(res.status).toBe(403);
    expect(readSolanaCreatorFeeSnapshot).not.toHaveBeenCalled();
  });

  it('reads fees for the SIWS session wallet only', async () => {
    getAuthenticatedAccountIdentity.mockReturnValue({
      namespace: 'solana',
      authMethod: 'siws',
      userId: USER,
      address: SOL,
      chainId: 900001,
      issuedAt: Date.now(),
    });
    readSolanaCreatorFeeSnapshot.mockResolvedValue({
      creator: SOL,
      claimableLamports: '1500000000',
      claimableSol: '1.5',
      claimableUsd: '$225.00',
      supported: true,
      feeMode: 'standard',
      message: 'Fees earned from your Pump launches.',
    });
    const res = await GET(new Request('http://localhost/api/account/solana/creator-fees'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.creator).toBe(SOL);
    expect(body.claimableSol).toBe('1.5');
    expect(readSolanaCreatorFeeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ creator: SOL }),
    );
  });
});

describe('POST /api/account/solana/creator-fees/prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSolanaConnection.mockReturnValue({});
  });

  it('rejects client-supplied creator overrides', async () => {
    getAuthenticatedAccountIdentity.mockReturnValue({
      namespace: 'solana',
      authMethod: 'siws',
      userId: USER,
      address: SOL,
      chainId: 900001,
      issuedAt: Date.now(),
    });
    const res = await PREPARE(
      new NextRequest('http://localhost/api/account/solana/creator-fees/prepare', {
        method: 'POST',
        body: JSON.stringify({ creator: 'OtherWallet1111111111111111111111111111111' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(prepareSolanaCreatorFeeClaim).not.toHaveBeenCalled();
  });

  it('prepares with session creator only', async () => {
    getAuthenticatedAccountIdentity.mockReturnValue({
      namespace: 'solana',
      authMethod: 'siws',
      userId: USER,
      address: SOL,
      chainId: 900001,
      issuedAt: Date.now(),
    });
    prepareSolanaCreatorFeeClaim.mockResolvedValue({
      transactionBase64: 'AQ==',
      recentBlockhash: 'bh',
      lastValidBlockHeight: 1,
      creator: SOL,
      claimableLamports: '1000',
      instructionCount: 2,
    });
    const res = await PREPARE(
      new NextRequest('http://localhost/api/account/solana/creator-fees/prepare', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(200);
    expect(prepareSolanaCreatorFeeClaim).toHaveBeenCalledWith(
      expect.objectContaining({ creator: SOL }),
    );
  });
});
