import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTokens = vi.fn();
const getActiveMarkets = vi.fn();
const getDiscoverBoard = vi.fn();
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
  getActiveMarkets,
  getDiscoverBoard,
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

vi.mock('@/lib/quotes/catalogue', () => ({
  loadEnabledQuoteCatalogue: vi.fn().mockResolvedValue([
    {
      chainId: 4663,
      quoteAsset: '0x0000000000000000000000000000000000000000',
      quoteType: 'native',
      symbol: 'ETH',
      displaySymbol: 'ETH',
      name: 'Ether',
      decimals: 18,
      category: 'crypto',
      imageUrl: null,
      sourceName: null,
      sortOrder: 1,
      isRegistered: true,
      isEnabled: true,
    },
  ]),
  SCOOP_CHAIN_ID: 4663,
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

  it('GET /api/markets returns the complete active set ranked by FDV without a 500 cap', async () => {
    const mk = (n: number, fdv: string | null) => {
      const hex = n.toString(16).padStart(40, '0');
      return {
        chainId: 4663,
        tokenAddress: `0x${hex}`,
        name: `T${n}`,
        symbol: `T${n}`,
        decimals: 18,
        imageUri: '',
        displayImageUrl: null,
        poolId: '0xpool',
        creatorId: '0x1111111111111111111111111111111111111111',
        quoteAsset: '0x0000000000000000000000000000000000000000',
        launchedAt: 1,
        ageSeconds: 1,
        launchProgressBps: 0,
        launchComplete: false,
        isNew: false,
        isSoon: false,
        isBonded: false,
        priceQuoteX18: null,
        priceQuoteDisplay: null,
        priceUsdX18: null,
        priceUsdDisplay: null,
        fdvUsdX18: fdv,
        fdvUsdDisplay: fdv,
        volume24hQuoteRaw: null,
        volume24hQuoteDisplay: null,
        volume24hUsdX18: null,
        volume24hUsdDisplay: null,
        tradeCount24h: null,
        buyCount24h: null,
        sellCount24h: null,
        holderCountAll: null,
        holderCountRetail: null,
        lastTradeAt: null,
        priceChange24hBps: null,
      };
    };

    // 502 markets: FDVs 1..501 plus one missing — formerly truncated at 500.
    const rows = [
      ...Array.from({ length: 501 }, (_, i) => mk(i + 1, String(i + 1))),
      mk(999_999, null),
    ];
    getActiveMarkets.mockResolvedValue(rows);

    const { GET } = await import('@/app/api/markets/route');
    const res = await GET(new Request('http://localhost/api/markets'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(502);
    expect(body.items[0].fdvUsdX18).toBe('501');
    expect(body.items[499].fdvUsdX18).toBe('2');
    expect(body.items[500].fdvUsdX18).toBe('1');
    expect(body.items[501].fdvUsdX18).toBeNull();
    expect(body.items[0].quoteSymbol).toBe('ETH');
    expect(new Set(body.items.map((i: { tokenAddress: string }) => i.tokenAddress)).size).toBe(
      502,
    );
    expect(getActiveMarkets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chainId: 4663 }),
    );
    expect(getTokens).not.toHaveBeenCalled();
    const text = JSON.stringify(body);
    expect(text).not.toContain('DATABASE_URL');
    expect(text).not.toContain('postgresql://');
  });

  it('GET /api/discover returns new, bonding, and trending from one board query', async () => {
    getDiscoverBoard.mockResolvedValue({
      new: [
        {
          chainId: 4663,
          tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          name: 'New',
          symbol: 'NEW',
          tradeCount24h: 1,
          buyCount24h: 1,
          sellCount24h: 0,
          volume24hUsdX18: null,
        },
      ],
      bonding: [
        {
          chainId: 4663,
          tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          name: 'Bond',
          symbol: 'BND',
          launchProgressBps: 9000,
          launchComplete: false,
        },
      ],
      trending: [
        {
          chainId: 4663,
          tokenAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
          name: 'Trend',
          symbol: 'TRD',
          tradeCount24h: 5,
          buyCount24h: 4,
          sellCount24h: 1,
          volume24hUsdX18: '1000',
        },
      ],
    });

    const { GET } = await import('@/app/api/discover/route');
    const res = await GET(new Request('http://localhost/api/discover'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.new[0].symbol).toBe('NEW');
    expect(body.bonding[0].symbol).toBe('BND');
    expect(body.trending[0].symbol).toBe('TRD');
    expect(getDiscoverBoard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ chainId: 4663 }),
    );
    expect(JSON.stringify(body)).not.toContain('postgresql://');
  });
});
