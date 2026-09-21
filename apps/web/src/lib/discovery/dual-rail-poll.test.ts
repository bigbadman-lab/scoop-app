import { afterEach, describe, expect, it, vi } from 'vitest';

describe('fetchMarketsBoard dual-rail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('calls /api/markets without chainId so Solana is included', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            tokenAddress: 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu',
            chainId: 900001,
            marketSource: 'pump',
            name: 'SCPY',
            symbol: 'SCPY',
            imageUri: '',
            displayImageUrl: null,
            quoteAsset: 'So11111111111111111111111111111111111111112',
            quoteSymbol: 'SOL',
            quoteImageUrl: null,
            launchedAt: 1,
            ageSeconds: 1,
            fdvUsdX18: '100',
            fdvUsdDisplay: '100',
            fdvQuoteDisplay: null,
            priceUsdDisplay: null,
            priceQuoteDisplay: null,
            volume24hUsdDisplay: null,
            volume24hQuoteDisplay: null,
            tradeCountAllTime: 11,
            tradeCount24h: 11,
            holderCountAll: null,
            holderCountRetail: null,
            loreTitle: null,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchMarketsBoard } = await import('@/lib/markets/fetch-markets');
    const snap = await fetchMarketsBoard();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/markets',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('chainId');
    expect(snap?.items).toHaveLength(1);
    expect(snap?.items[0]?.tokenAddress).toBe(
      'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu',
    );
  });
});

describe('fetchDiscoverSnapshot dual-rail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('calls /api/discover without chainId so Solana is included', async () => {
    const mint = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
    const row = {
      chainId: 900001,
      tokenAddress: mint,
      name: 'SCPY',
      symbol: 'SCPY',
      decimals: 6,
      imageUri: '',
      displayImageUrl: null,
      marketSource: 'pump',
      marketPhase: null,
      poolId: null,
      curveAddress: null,
      creatorId: 'x',
      quoteAsset: 'So11111111111111111111111111111111111111112',
      launchedAt: 1,
      ageSeconds: 1,
      launchProgressBps: 0,
      launchComplete: false,
      isNew: true,
      isSoon: false,
      isBonded: false,
      priceQuoteX18: null,
      priceQuoteDisplay: null,
      priceUsdX18: null,
      priceUsdDisplay: null,
      fdvUsdX18: null,
      fdvUsdDisplay: null,
      volume24hQuoteRaw: null,
      volume24hQuoteDisplay: null,
      volume24hUsdX18: null,
      volume24hUsdDisplay: null,
      tradeCount24h: 11,
      tradeCountAllTime: 11,
      buyCount24h: null,
      sellCount24h: null,
      holderCountAll: null,
      holderCountRetail: null,
      lastTradeAt: null,
      priceChange24hBps: null,
      loreTitle: null,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ new: [row], bonding: [], trending: [row] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchDiscoverSnapshot } = await import(
      '@/lib/discovery/fetch-discover'
    );
    const snap = await fetchDiscoverSnapshot();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/discover',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('chainId');
    expect(snap?.new.items[0]?.tokenAddress).toBe(mint);
  });
});
