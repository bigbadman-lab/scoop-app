import { describe, expect, it, vi, afterEach } from 'vitest';
import { loadDeskSpot } from '@/lib/market/spot';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadDeskSpot', () => {
  it('merges crypto and index feeds into ordered instruments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('coingecko')) {
          return Response.json({
            ethereum: { usd: 2500, usd_24h_change: 1.25 },
            bitcoin: { usd: 80000, usd_24h_change: -0.5 },
          });
        }
        if (url.includes('%5EGSPC') || url.includes('^GSPC')) {
          return Response.json({
            chart: {
              result: [{ meta: { regularMarketPrice: 7718.6, chartPreviousClose: 7666.6 } }],
            },
          });
        }
        if (url.includes('%5EFTSE') || url.includes('^FTSE')) {
          return Response.json({
            chart: {
              result: [{ meta: { regularMarketPrice: 9200.1, previousClose: 9100 } }],
            },
          });
        }
        return new Response('not found', { status: 404 });
      }),
    );

    const spot = await loadDeskSpot();
    expect(spot.source).toBe('live');
    expect(spot.instruments.map((i) => i.id)).toEqual(['eth', 'btc', 'spx', 'ftse']);
    expect(spot.instruments[0]).toMatchObject({
      label: 'ETH',
      price: 2500,
      changePct: 1.25,
    });
    expect(spot.instruments[2]?.label).toBe('S&P 500');
    expect(spot.instruments[2]?.price).toBe(7718.6);
    expect(spot.instruments[2]?.changePct).toBeCloseTo(((7718.6 - 7666.6) / 7666.6) * 100, 5);
    expect(spot.instruments[3]?.label).toBe('FTSE 100');
    expect(spot.instruments[3]?.changePct).toBeCloseTo(((9200.1 - 9100) / 9100) * 100, 5);
  });

  it('returns partial when one feed fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('coingecko')) {
          return Response.json({
            ethereum: { usd: 2500, usd_24h_change: 0 },
            bitcoin: { usd: 80000, usd_24h_change: 0 },
          });
        }
        return new Response('blocked', { status: 403 });
      }),
    );

    const spot = await loadDeskSpot();
    expect(spot.source).toBe('partial');
    expect(spot.instruments[0]?.price).toBe(2500);
    expect(spot.instruments[2]?.price).toBeNull();
    expect(spot.instruments[3]?.price).toBeNull();
  });
});
