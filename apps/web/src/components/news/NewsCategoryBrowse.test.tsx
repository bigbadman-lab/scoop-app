import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NewsCategoryBrowse } from '@/components/news/NewsCategoryBrowse';
import { NEWS_CATEGORY_ARTWORK } from '@/lib/brand';

vi.mock('next/image', () => ({
  default: (props: {
    alt: string;
    src: string;
    fill?: boolean;
    'data-testid'?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt}
      src={props.src}
      data-testid={props['data-testid']}
    />
  ),
}));

describe('NewsCategoryBrowse artwork cards', () => {
  it('maps Stocks/Markets artwork and preserves selection semantics', () => {
    const onSelect = vi.fn();
    render(<NewsCategoryBrowse selected="stocks" onSelect={onSelect} />);

    const stocks = screen.getByTestId('news-category-stocks');
    const markets = screen.getByTestId('news-category-markets');

    expect(stocks.getAttribute('aria-pressed')).toBe('true');
    expect(markets.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('news-category-stocks-selected-dot')).toBeTruthy();
    expect(screen.queryByTestId('news-category-markets-selected-dot')).toBeNull();

    expect(screen.getByTestId('news-category-stocks-artwork').getAttribute('src')).toBe(
      NEWS_CATEGORY_ARTWORK.stocks.src,
    );
    expect(screen.getByTestId('news-category-markets-artwork').getAttribute('src')).toBe(
      NEWS_CATEGORY_ARTWORK.markets.src,
    );

    expect(screen.getByRole('button', { name: /Stocks/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Markets/i })).toBeTruthy();
    expect(stocks.getAttribute('aria-describedby')).toBe('news-category-stocks-desc');
    expect(markets.getAttribute('aria-describedby')).toBe('news-category-markets-desc');
    expect(screen.getByText(/Stock-moving company news/i)).toBeTruthy();
    expect(screen.getByText(/Macro, policy and events moving the tape/i)).toBeTruthy();

    fireEvent.click(markets);
    expect(onSelect).toHaveBeenCalledWith('markets');
  });

  it('shows Markets selected state when Markets is active', () => {
    render(<NewsCategoryBrowse selected="markets" onSelect={() => {}} />);
    expect(screen.getByTestId('news-category-markets').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('news-category-stocks').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByTestId('news-category-markets-selected-dot')).toBeTruthy();
    expect(screen.queryByTestId('news-category-stocks-selected-dot')).toBeNull();
  });
});
