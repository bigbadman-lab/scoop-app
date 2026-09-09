import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokens = vi.fn();
const getToken = vi.fn();
const getTrades = vi.fn();
const getHolders = vi.fn();
const getCandles = vi.fn();
const getCreatorEarnings = vi.fn();
const getRankings = vi.fn();
const getIndexerStatus = vi.fn();
const assertCandleInterval = vi.fn((v: string) => {
  if (!['5s', '1m', '5m', '15m', '1h', '4h', '1d'].includes(v)) throw new Error('bad');
  return v;
});
const assertRankingType = vi.fn((v: string) => {
  if (v !== 'volume24h' && v !== 'newest') throw new Error('bad');
  return v;
});

vi.mock('@/lib/server/queries', () => ({
  getTokens,
  getToken,
  getTrades,
  getHolders,
  getCandles,
  getCreatorEarnings,
  getRankings,
  getIndexerStatus,
  assertCandleInterval,
  assertRankingType,
  serverDb: () => ({}),
}));

describe('product API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/scoop';
  });

  it('rejects invalid token address', async () => {
    const { GET } = await import('@/app/api/tokens/[address]/route');
    const res = await GET(new Request('http://localhost/api/tokens/not-an-address'), {
      params: Promise.resolve({ address: 'not-an-address' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/address/i);
    expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(body)).not.toContain('postgresql://');
  });

  it('rejects invalid candle interval', async () => {
    const { GET } = await import('@/app/api/tokens/[address]/candles/route');
    const res = await GET(
      new Request(
        'http://localhost/api/tokens/0x2284ed0e4d446c6d78ac2d49a68bae822fd87373/candles?interval=2m',
      ),
      {
        params: Promise.resolve({
          address: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        }),
      },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain('postgresql://');
  });

  it('returns tokens without leaking secrets', async () => {
    getTokens.mockResolvedValue([
      {
        chainId: 4663,
        tokenAddress: '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373',
        name: 'Hello World',
        symbol: 'HELLO',
      },
    ]);
    const { GET } = await import('@/app/api/tokens/route');
    const res = await GET(new Request('http://localhost/api/tokens?limit=10'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].symbol).toBe('HELLO');
    const text = JSON.stringify(body);
    expect(text).not.toContain('DATABASE_URL');
    expect(text).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(text).not.toContain('postgresql://');
    expect(text).not.toContain('ROBINHOOD_RPC_URL');
  });

  it('rejects invalid ranking type', async () => {
    const { GET } = await import('@/app/api/rankings/route');
    const res = await GET(new Request('http://localhost/api/rankings?type=nope'));
    expect(res.status).toBe(400);
  });

  it('caps limit validation at max 100 via parse path', async () => {
    getTokens.mockResolvedValue([]);
    const { GET } = await import('@/app/api/tokens/route');
    const res = await GET(new Request('http://localhost/api/tokens?limit=0'));
    expect(res.status).toBe(400);
  });
});
