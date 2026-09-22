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

  it('Pump rows render SOL quote + USD notional for buy and sell', async () => {
    const mint = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
    const buy: TradeItem = {
      chainId: 900001,
      txHash: 'SigBuy'.padEnd(64, '1'),
      logIndex: 0,
      blockNumber: 1,
      blockTimestamp: 1_800_000_100,
      tokenAddress: mint,
      poolId: mint,
      side: 'buy',
      swapSender: 'Wallet1',
      txFrom: 'Wallet1',
      traderAddress: 'Wallet1',
      traderAttributionType: 'wallet',
      quoteAmountRaw: '250000000',
      quoteAmountDisplay: '0.25',
      tokenAmountRaw: '1000000',
      tokenAmountDisplay: '1',
      executionPriceQuoteX18: '250000000000000000',
      executionPriceQuoteDisplay: '0.25',
      quoteUsdX18: '118000000000000000000',
      executionPriceUsdX18: '29500000000000000000',
      executionPriceUsdDisplay: '29.5',
      usdValueX18: '29500000000000000000',
      usdValueDisplay: '29.5',
      isInitialBuy: false,
      confirmationStatus: 'confirmed',
    };
    const sell: TradeItem = {
      ...buy,
      txHash: 'SigSell'.padEnd(64, '2'),
      logIndex: 1,
      blockTimestamp: 1_800_000_090,
      side: 'sell',
      quoteAmountRaw: '100000000',
      quoteAmountDisplay: '0.1',
      usdValueX18: '11800000000000000000',
      usdValueDisplay: '11.8',
      executionPriceUsdDisplay: '11.8',
    };
    vi.mocked(fetch).mockResolvedValue(Response.json({ items: [buy, sell] }));

    render(
      <TokenRecentTrades
        tokenAddress={mint}
        quoteSymbol="SOL"
        marketSource="pump"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('token-recent-trades-table')).toBeTruthy(),
    );
    const rows = screen.getAllByTestId('token-recent-trade-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.getAttribute('data-side')).toBe('BUY');
    expect(within(rows[0]!).getByTestId('token-recent-trade-quote-amt').textContent).toBe(
      '0.25 SOL',
    );
    expect(within(rows[0]!).getByTestId('token-recent-trade-usd').textContent).toBe('$29.5');
    expect(rows[1]!.getAttribute('data-side')).toBe('SELL');
    expect(within(rows[1]!).getByTestId('token-recent-trade-quote-amt').textContent).toBe(
      '0.1 SOL',
    );
    expect(within(rows[1]!).getByTestId('token-recent-trade-usd').textContent).toBe('$11.8');
    // Quote column always visible for pump (no lg:hidden).
    expect(
      within(rows[0]!).getByTestId('token-recent-trade-quote-amt').className,
    ).not.toMatch(/hidden/);
    expect(within(rows[0]!).getByTestId('token-recent-trade-tx').getAttribute('href')).toContain(
      'solana',
    );
  });

  it('RHC quote column stays lg-gated (unchanged)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ items: helloTradesNewestFirst().slice(0, 1) }),
    );
    render(
      <TokenRecentTrades
        tokenAddress="0x2284ed0e4d446c6d78ac2d49a68bae822fd87373"
        quoteSymbol="ETH"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('token-recent-trade-quote-amt')).toBeTruthy(),
    );
    expect(screen.getByTestId('token-recent-trade-quote-amt').className).toMatch(/lg:table-cell/);
  });
});
