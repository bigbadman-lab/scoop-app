import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuoteAssetBadge } from '@/components/ui/QuoteAssetBadge';

describe('QuoteAssetBadge', () => {
  it('renders catalogue image and symbol when imageUrl is present', () => {
    render(<QuoteAssetBadge symbol="ETH" imageUrl="https://cdn.example/eth.png" />);
    expect(screen.getByTestId('quote-asset-badge').textContent).toMatch(/ETH/);
    expect(document.querySelector('img[src="https://cdn.example/eth.png"]')).toBeTruthy();
    expect(screen.queryByTestId('quote-asset-monogram')).toBeNull();
  });

  it('falls back to monogram when imageUrl is null', () => {
    render(<QuoteAssetBadge symbol="AAPL" imageUrl={null} />);
    expect(screen.getByTestId('quote-asset-monogram').textContent).toBe('A');
    expect(screen.getByTestId('quote-asset-badge').textContent).toMatch(/AAPL/);
    expect(document.querySelector('img')).toBeNull();
  });

  it('falls back to monogram when image fails to load', () => {
    render(<QuoteAssetBadge symbol="NVDA" imageUrl="https://cdn.example/broken.png" />);
    const logo = document.querySelector('img[src="https://cdn.example/broken.png"]');
    expect(logo).toBeTruthy();
    fireEvent.error(logo!);
    expect(screen.getByTestId('quote-asset-monogram').textContent).toBe('N');
  });
});
