import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CopyMarketLinkButton } from '@/components/ui/CopyMarketLinkButton';

describe('CopyMarketLinkButton', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'https://scoop.fun/token/0xabc' },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('copies the current page URL and shows brief confirmation', async () => {
    render(<CopyMarketLinkButton />);

    const button = screen.getByRole('button', { name: /copy market link/i });
    expect(button.getAttribute('data-testid')).toBe('copy-market-link');

    fireEvent.click(button);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://scoop.fun/token/0xabc',
      );
    });
    expect(screen.getByRole('button', { name: /market link copied/i })).toBeTruthy();
    expect(screen.getByTestId('copy-market-link').getAttribute('data-copied')).toBe(
      'true',
    );
    expect(screen.getByTestId('copy-market-link').textContent).toMatch(/Copied/i);

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.getByRole('button', { name: /copy market link/i })).toBeTruthy();
    expect(screen.getByTestId('copy-market-link').getAttribute('data-copied')).toBe(
      'false',
    );
  });

  it('does not trigger parent navigation and survives clipboard failure', async () => {
    const parentClick = vi.fn();
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'));

    render(
      <div onClick={parentClick} role="link">
        <CopyMarketLinkButton />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy market link/i }));
    expect(parentClick).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: /copy market link/i })).toBeTruthy();
    expect(screen.getByTestId('copy-market-link').getAttribute('data-copied')).toBe(
      'false',
    );
  });
});
