import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import {
  HOUSE_FADE_MS,
  HOUSE_HOVER_ADVANCE_MS,
  HOUSE_ROTATE_MS,
  HOMEPAGE_NEWS_FADE_MS,
  HOMEPAGE_NEWS_ROTATION_MS,
  HouseLeadHero,
} from '@/components/home/HouseLeadHero';
import type { LeadNewsResult } from '@/lib/news/load-home';
import type { NewsFeedItem } from '@scoop/news';

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

function makeArticle(id: string, headline: string): NewsFeedItem {
  return {
    providerArticleId: id,
    headline,
    description: null,
    sourceDomain: 'reuters.com',
    url: `https://reuters.com/${id}`,
    publishedAt: new Date().toISOString(),
    crawledAt: new Date().toISOString(),
    tickers: [],
    tags: [],
    isBackfillCandidate: false,
  };
}

const article = makeArticle('77', 'Markets react to rate decision');

function okNews(articles: NewsFeedItem[]): LeadNewsResult {
  return {
    status: 'ok',
    article: articles[0] ?? null,
    articles,
  };
}

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
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders configured house images and real story overlay', () => {
    render(<HouseLeadHero news={okNews([article])} />);
    const imgs = document.querySelectorAll('img[data-src]');
    expect(imgs.length).toBe(3);
    expect(document.querySelector('img[data-src="/house/01.webp"]')).toBeTruthy();
    expect(document.querySelector('img[data-src="/house/02.webp"]')).toBeTruthy();
    expect(document.querySelector('img[data-src="/house/03.webp"]')).toBeTruthy();
    expect(screen.getByText('Markets react to rate decision')).toBeTruthy();
    expect(screen.getByText('reuters.com')).toBeTruthy();
  });

  it('does not wrap the whole tile in a story link', () => {
    render(<HouseLeadHero news={okNews([article])} />);
    expect(
      screen.queryByRole('link', { name: /Markets react to rate decision/i }),
    ).toBeNull();
  });

  it('overlays Launch as Token and Read story on the house image', () => {
    render(<HouseLeadHero news={okNews([article])} />);
    const actions = screen.getByTestId('house-lead-actions');
    expect(actions.closest('[data-testid="house-lead-hero"]')).toBeTruthy();

    const launch = screen.getByRole('link', { name: /launch as token/i });
    expect(launch.getAttribute('href')).toBe('/news/77/launch');
    const read = screen.getByRole('link', { name: /read story/i });
    expect(read.getAttribute('href')).toBe(article.url);
    expect(read.className).toMatch(/border/);
    expect(read.className).toMatch(/rounded/);
    expect(launch.closest('[data-testid="house-lead-hero"]')).toBeTruthy();
    expect(read.closest('[data-testid="house-lead-hero"]')).toBeTruthy();
  });

  it('keeps Launch as Token without Read story when article has no URL', () => {
    render(
      <HouseLeadHero
        news={okNews([{ ...article, url: '' }])}
      />,
    );
    expect(screen.getByRole('link', { name: /launch as token/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /read story/i })).toBeNull();
    expect(screen.getByText('Markets react to rate decision')).toBeTruthy();
  });

  it('hides story actions when there is no article', () => {
    render(
      <HouseLeadHero
        news={{
          status: 'empty',
          article: null,
          articles: [],
          message: 'No stories yet.',
        }}
      />,
    );
    expect(screen.queryByTestId('house-lead-actions')).toBeNull();
    expect(screen.queryByRole('link', { name: /launch as token/i })).toBeNull();
  });

  it('does not invent a headline when news is unavailable', () => {
    render(
      <HouseLeadHero
        news={{
          status: 'gated',
          article: null,
          articles: [],
          message: 'Latest story display is not enabled yet.',
        }}
      />,
    );
    expect(screen.getByText('Latest story pending')).toBeTruthy();
    expect(screen.queryByText(/reuters/i)).toBeNull();
    expect(screen.queryByText(/fabricated/i)).toBeNull();
  });

  it('rotates house images 01 → 02 → 03 → 01', () => {
    render(<HouseLeadHero news={okNews([article])} />);
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

  it('advances on top-left hotspot click without relying on the story link', () => {
    render(<HouseLeadHero news={okNews([article])} />);
    const opacityOf = (src: string) =>
      (document.querySelector(`img[data-src="${src}"]`) as HTMLImageElement | null)
        ?.style.opacity;

    expect(opacityOf('/house/01.webp')).toBe('1');
    const hotspot = screen.getByTestId('house-lead-rotate');
    expect(hotspot.closest('a')).toBeNull();

    act(() => {
      hotspot.click();
    });
    expect(opacityOf('/house/02.webp')).toBe('1');
    expect(opacityOf('/house/01.webp')).toBe('0');
  });

  it('advances on top-left hover with cooldown using HOUSE_HOVER_ADVANCE_MS', () => {
    vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
    render(<HouseLeadHero news={okNews([article])} />);
    const opacityOf = (src: string) =>
      (document.querySelector(`img[data-src="${src}"]`) as HTMLImageElement | null)
        ?.style.opacity;
    const hotspot = screen.getByTestId('house-lead-rotate');

    act(() => {
      fireEvent.mouseEnter(hotspot);
    });
    expect(opacityOf('/house/02.webp')).toBe('1');

    act(() => {
      fireEvent.mouseEnter(hotspot);
    });
    expect(opacityOf('/house/02.webp')).toBe('1');

    act(() => {
      vi.setSystemTime(
        new Date(Date.parse('2026-09-07T12:00:00.000Z') + HOUSE_HOVER_ADVANCE_MS + 1),
      );
      fireEvent.mouseEnter(hotspot);
    });
    expect(opacityOf('/house/03.webp')).toBe('1');
  });

  it('disables automatic house-image rotation when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(<HouseLeadHero news={okNews([article])} />);
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

  describe('story rotation', () => {
    const pool = [
      makeArticle('1', 'Story one headline'),
      makeArticle('2', 'Story two headline'),
      makeArticle('3', 'Story three headline'),
    ];

    function flushStoryFade() {
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_FADE_MS);
      });
    }

    it('starts on the first loaded story and does not rotate before 20s', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      render(<HouseLeadHero news={okNews(pool)} />);
      expect(screen.getByText('Story one headline')).toBeTruthy();
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-id')).toBe('1');
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-offset')).toBe(
        '0',
      );

      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS - 1);
      });
      expect(screen.getByText('Story one headline')).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rotates to the next story at 20s and advances again', () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      render(<HouseLeadHero news={okNews(pool)} />);

      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();
      expect(screen.getByRole('link', { name: /launch as token/i }).getAttribute('href')).toBe(
        '/news/2/launch',
      );

      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story three headline')).toBeTruthy();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('wraps cleanly back to the first story', () => {
      render(<HouseLeadHero news={okNews(pool)} />);
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story three headline')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story one headline')).toBeTruthy();
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-id')).toBe('1');
    });

    it('keeps house image slot identity stable across story changes', () => {
      render(<HouseLeadHero news={okNews(pool)} />);
      const before = Array.from(document.querySelectorAll('img[data-src]')).map((el) =>
        el.getAttribute('data-src'),
      );
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      const after = Array.from(document.querySelectorAll('img[data-src]')).map((el) =>
        el.getAttribute('data-src'),
      );
      expect(after).toEqual(before);
      expect(screen.getByTestId('house-lead-hero')).toBeTruthy();
    });

    it('does not start a story timer when pool fits a single slot', () => {
      render(<HouseLeadHero news={okNews([article])} />);
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS * 2);
      });
      expect(screen.getByText('Markets react to rate decision')).toBeTruthy();
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-offset')).toBe(
        '0',
      );
    });

    it('stays safe with an empty collection', () => {
      render(
        <HouseLeadHero
          news={{ status: 'empty', article: null, articles: [], message: 'No stories yet.' }}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS * 2);
      });
      expect(screen.getByText('No stories yet')).toBeTruthy();
      expect(screen.queryByTestId('house-lead-actions')).toBeNull();
    });

    it('continues story rotation while the cursor rests over the hero', () => {
      render(<HouseLeadHero news={okNews(pool)} />);
      act(() => {
        fireEvent.mouseEnter(screen.getByTestId('house-lead-module'));
      });
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story three headline')).toBeTruthy();
    });

    it('updates displayed article and CTAs after the fade completes', () => {
      render(<HouseLeadHero news={okNews(pool)} />);
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      // Mid-fade: target advanced but display may still be fading
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-offset')).toBe(
        '1',
      );
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-id')).toBe('2');
      expect(screen.getByRole('link', { name: /launch as token/i }).getAttribute('href')).toBe(
        '/news/2/launch',
      );
      expect(screen.getByRole('link', { name: /read story/i }).getAttribute('href')).toBe(
        'https://reuters.com/2',
      );
    });

    it('does not reset offset when the same article signature re-renders', () => {
      const { rerender } = render(<HouseLeadHero news={okNews(pool)} />);
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();

      // Same IDs/order — signature unchanged
      rerender(<HouseLeadHero news={okNews([...pool])} />);
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-offset')).toBe(
        '1',
      );
      expect(screen.getByText('Story two headline')).toBeTruthy();
    });

    it('pauses story rotation while the document is hidden', () => {
      let hidden = false;
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => hidden,
      });
      render(<HouseLeadHero news={okNews(pool)} />);

      hidden = true;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS * 2);
      });
      expect(screen.getByText('Story one headline')).toBeTruthy();

      hidden = false;
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();
    });

    it('resets to the first story when the article pool signature changes', () => {
      const { rerender } = render(<HouseLeadHero news={okNews(pool)} />);
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      flushStoryFade();
      expect(screen.getByText('Story two headline')).toBeTruthy();

      const nextPool = [
        makeArticle('a', 'Alpha headline'),
        makeArticle('b', 'Bravo headline'),
      ];
      rerender(<HouseLeadHero news={okNews(nextPool)} />);
      flushStoryFade();
      expect(screen.getByText('Alpha headline')).toBeTruthy();
      expect(screen.getByTestId('house-lead-story').getAttribute('data-story-offset')).toBe(
        '0',
      );
    });

    it('still swaps stories under reduced motion without house-image auto-rotate', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      render(<HouseLeadHero news={okNews(pool)} />);
      act(() => {
        vi.advanceTimersByTime(HOMEPAGE_NEWS_ROTATION_MS);
      });
      expect(screen.getByText('Story two headline')).toBeTruthy();
      const opacityOf = (src: string) =>
        (document.querySelector(`img[data-src="${src}"]`) as HTMLImageElement | null)
          ?.style.opacity;
      expect(opacityOf('/house/01.webp')).toBe('1');
    });

    it('cleans up timers on unmount', () => {
      const clearSpy = vi.spyOn(window, 'clearInterval');
      const { unmount } = render(<HouseLeadHero news={okNews(pool)} />);
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
