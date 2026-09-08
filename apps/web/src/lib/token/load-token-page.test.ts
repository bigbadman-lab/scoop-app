import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadTokenPage } from '@/lib/token/load-token-page';

const getToken = vi.fn();
const loadEnabledQuoteCatalogue = vi.fn();
const serverDb = vi.fn(() => ({ query: vi.fn() }));

vi.mock('@/lib/server/queries', () => ({
  getToken: (...args: unknown[]) => getToken(...args),
  serverDb: () => serverDb(),
}));

vi.mock('@/lib/quotes/catalogue', () => ({
  SCOOP_CHAIN_ID: 4663,
  loadEnabledQuoteCatalogue: (...args: unknown[]) => loadEnabledQuoteCatalogue(...args),
}));

describe('loadTokenPage', () => {
  beforeEach(() => {
    getToken.mockReset();
    loadEnabledQuoteCatalogue.mockReset();
    loadEnabledQuoteCatalogue.mockResolvedValue([
      {
        quoteAsset: '0x0000000000000000000000000000000000000000',
        displaySymbol: 'ETH',
        symbol: 'ETH',
      },
    ]);
  });

  it('rejects invalid addresses', async () => {
    await expect(loadTokenPage('not-an-address')).resolves.toEqual({ status: 'invalid' });
    expect(getToken).not.toHaveBeenCalled();
  });

  it('returns not_found for unknown valid address', async () => {
    getToken.mockResolvedValue(null);
    await expect(
      loadTokenPage('0x2284ed0e4d446c6d78ac2d49a68bae822fd87373'),
    ).resolves.toEqual({ status: 'not_found' });
  });

  it('returns ok token with catalogue quote symbol', async () => {
    getToken.mockResolvedValue({
      tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
      quoteAsset: '0x0000000000000000000000000000000000000000',
      symbol: 'HELLO',
    });
    const result = await loadTokenPage('0x2284Ed0e4d446C6d78AC2d49A68baE822Fd87373');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.quoteSymbol).toBe('ETH');
      expect(result.token.symbol).toBe('HELLO');
    }
    expect(getToken).toHaveBeenCalledWith(
      expect.anything(),
      4663,
      '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
    );
  });

  it('maps loader failures to unavailable without throwing', async () => {
    getToken.mockRejectedValue(new Error('db down'));
    await expect(
      loadTokenPage('0x2284ed0e4d446c6d78ac2d49a68bae822fd87373'),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
