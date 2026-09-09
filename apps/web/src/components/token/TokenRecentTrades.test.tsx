import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { TokenRecentTrades } from '@/components/token/TokenRecentTrades';
import { clearTradeCache } from '@/lib/token/fetch-trades';
import { helloTradesNewestFirst } from '@/lib/token/hello-trades.fixture';
import type { TradeItem } from '@scoop/db';

describe('TokenRecentTrades', () => {
  beforeEach(() => {
    clearTradeCache();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders HELLO fixture newest-first with BUY/SELL and tx links', async () => {
    const items = helloTradesNewestFirst();
    vi.mocked(fetch).mockResolvedValue(Response.json({ items }));

    render(
      <TokenRecentTrades
        tokenAddress="0x2284ed0e4d446c6d78ac2d49a68bae822fd87373"
        quoteSymbol="ETH"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('token-recent-trades-table')).toBeTruthy(),
    );

    const rows = screen.getAllByTestId('token-recent-trade-row');
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.getAttribute('data-side'))).toEqual([
      'SELL',
      'BUY',
      'SELL',
      'BUY',
      'SELL',
      'BUY',
      'BUY',
    ]);

    expect(within(rows[0]!).getByTestId('token-recent-trade-price').textContent).toBe(
      '$0.000004981',
    );
    expect(within(rows[0]!).getByTestId('token-recent-trade-usd').textContent).toBe('$0.485');
    expect(within(rows[3]!).getByTestId('token-recent-trade-usd').textContent).toBe('$123.2');

    const tx = within(rows[0]!).getByTestId('token-recent-trade-tx');
    expect(tx.getAttribute('href')).toContain(
      'explorer.mainnet.chain.robinhood.com/tx/0x7777',
    );
    expect(tx.getAttribute('target')).toBe('_blank');

    expect(screen.getByTestId('token-recent-trades-title').textContent).toMatch(/Recent Trades/i);
  });

  it('shows quote-only price and em dash for null USD', async () => {
    const base = helloTradesNewestFirst()[0]!;
    const quoteOnly: TradeItem = {
      ...base,
      executionPriceUsdX18: null,
      executionPriceUsdDisplay: null,
      usdValueX18: null,
      usdValueDisplay: null,
      traderAddress: null,
      txFrom: null,
    };
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: [quoteOnly] }));

    render(
      <TokenRecentTrades tokenAddress="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" quoteSymbol="ETH" />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('token-recent-trade-price').textContent).toBe(
        '0.000000002009 ETH',
      ),
    );
    expect(screen.getByTestId('token-recent-trade-usd').textContent).toBe('—');
  });

  it('shows empty and error with retry', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: [] }));
    const { rerender } = render(
      <TokenRecentTrades
        tokenAddress="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        quoteSymbol="ETH"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('token-recent-trades-empty').textContent).toMatch(/No trades yet/i),
    );

    clearTradeCache();
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 500 }));
    rerender(
      <TokenRecentTrades
        tokenAddress="0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        quoteSymbol="ETH"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('token-recent-trades-error')).toBeTruthy());

    clearTradeCache();
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: helloTradesNewestFirst().slice(0, 1) }));
    fireEvent.click(screen.getByTestId('token-recent-trades-retry'));
    await waitFor(() =>
      expect(screen.getByTestId('token-recent-trades-table')).toBeTruthy(),
    );
    expect(screen.getAllByTestId('token-recent-trade-row')).toHaveLength(1);
  });

  it('caps visible rows at 20 when API returns more', async () => {
    const seed = helloTradesNewestFirst();
    const items: TradeItem[] = [];
    for (let i = 0; i < 35; i += 1) {
      items.push({
        ...seed[0]!,
        logIndex: i,
        blockTimestamp: 1_800_000_000 - i,
        txHash: `0x${i.toString(16).padStart(64, 'd')}`,
      });
    }
    vi.mocked(fetch).mockResolvedValue(Response.json({ items }));

    render(
      <TokenRecentTrades
        tokenAddress="0xcccccccccccccccccccccccccccccccccccccccc"
        quoteSymbol="ETH"
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByTestId('token-recent-trade-row')).toHaveLength(20),
    );
  });
});
