import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  HOUSE_FADE_MS,
  HOUSE_ROTATE_MS,
  HouseLeadHero,
} from '@/components/home/HouseLeadHero';

vi.mock('next/image', () => ({
  default: (props: {
    alt: string;
    src: string;
    priority?: boolean;
    fill?: boolean;
    style?: React.CSSProperties;
    className?: string;
    'aria-hidden'?: boolean;
  }) => {
    const { priority: _p, fill: _f, ...rest } = props;
    void _p;
    void _f;
    // eslint-disable-next-line @next/next/no-img-element
    return <img data-src={props.src} alt={props.alt} {...rest} />;
  },
}));

vi.mock('@/lib/brand', () => ({
  HOUSE_IMAGE_SET: ['/house/01.webp', '/house/02.webp', '/house/03.webp'],
}));

const article = {
  providerArticleId: '77',
  headline: 'Markets react to rate decision',
  description: null,
  sourceDomain: 'reuters.com',
  url: 'https://reuters.com/markets/rate-decision',
  publishedAt: new Date().toISOString(),
  crawledAt: new Date().toISOString(),
  tickers: [] as string[],
  tags: [] as string[],
  isBackfillCandidate: false,
};

describe('HouseLeadHero', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders configured house images and real story overlay', () => {
    render(
      <HouseLeadHero
        news={{ status: 'ok', article }}
      />,
    );
    const imgs = document.querySelectorAll('img[data-src]');
    expect(imgs.length).toBe(3);
    expect(document.querySelector('img[data-src="/house/01.webp"]')).toBeTruthy();
    expect(document.querySelector('img[data-src="/house/02.webp"]')).toBeTruthy();
    expect(document.querySelector('img[data-src="/house/03.webp"]')).toBeTruthy();
    expect(screen.getByText('Markets react to rate decision')).toBeTruthy();
    expect(screen.getByText('reuters.com')).toBeTruthy();
  });

  it('makes the tile an external link when article URL exists', () => {
    render(<HouseLeadHero news={{ status: 'ok', article }} />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(article.url);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('does not create a fake link without article URL', () => {
    render(
      <HouseLeadHero
        news={{
          status: 'ok',
          article: { ...article, url: '' },
        }}
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Markets react to rate decision')).toBeTruthy();
  });

  it('does not invent a headline when news is unavailable', () => {
    render(
      <HouseLeadHero
        news={{
          status: 'gated',
          article: null,
          message: 'Latest story display is not enabled yet.',
        }}
      />,
    );
    expect(screen.getByText('Latest story pending')).toBeTruthy();
    expect(screen.queryByText(/reuters/i)).toBeNull();
    expect(screen.queryByText(/fabricated/i)).toBeNull();
  });

  it('rotates 01 → 02 → 03 → 01', () => {
    render(<HouseLeadHero news={{ status: 'ok', article }} />);
    const opacityOf = (src: string) =>
      (document.querySelector(`img[data-src="${src}"]`) as HTMLImageElement | null)
        ?.style.opacity;

    expect(opacityOf('/house/01.webp')).toBe('1');
    expect(opacityOf('/house/02.webp')).toBe('0');

    act(() => {
      vi.advanceTimersByTime(HOUSE_ROTATE_MS);
    });
    expect(opacityOf('/house/02.webp')).toBe('1');
    expect(opacityOf('/house/01.webp')).toBe('0');

    act(() => {
      vi.advanceTimersByTime(HOUSE_ROTATE_MS);
    });
    expect(opacityOf('/house/03.webp')).toBe('1');

    act(() => {
      vi.advanceTimersByTime(HOUSE_ROTATE_MS);
    });
    expect(opacityOf('/house/01.webp')).toBe('1');
    expect(HOUSE_FADE_MS).toBeGreaterThanOrEqual(400);
    expect(HOUSE_FADE_MS).toBeLessThanOrEqual(600);
  });

  it('disables automatic rotation when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<HouseLeadHero news={{ status: 'ok', article }} />);
    const opacityOf = (src: string) =>
      (document.querySelector(`img[data-src="${src}"]`) as HTMLImageElement | null)
        ?.style.opacity;

    expect(opacityOf('/house/01.webp')).toBe('1');
    act(() => {
      vi.advanceTimersByTime(HOUSE_ROTATE_MS * 3);
    });
    expect(opacityOf('/house/01.webp')).toBe('1');
    expect(opacityOf('/house/02.webp')).toBe('0');
  });
});
