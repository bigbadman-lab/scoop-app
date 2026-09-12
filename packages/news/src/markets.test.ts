import { describe, expect, it, vi } from 'vitest';
import {
  evaluateMarketsNewsRelevance,
  looksLikeSingleNameContamination,
  hasSingleNameTitleShape,
} from './markets-relevance.js';
import {
  MARKETS_MAX_ARTICLE_AGE_MS,
  isWithinMarketsAgeWindow,
} from './markets-freshness.js';
import { formatMarketsDryRunReport, runMarketsDryRun } from './markets-dry-run.js';
import { createStockNewsClient, STOCK_NEWS_API_BASE } from './stocknews-client.js';
import { isNewsFeedCategory, NEWS_FEED_CATEGORIES } from './feed-category.js';

describe('NewsFeedCategory', () => {
  it('exposes stocks and markets identities', () => {
    expect(NEWS_FEED_CATEGORIES).toEqual(['stocks', 'markets']);
    expect(isNewsFeedCategory('markets')).toBe(true);
    expect(isNewsFeedCategory('crypto')).toBe(false);
  });
});

describe('markets freshness', () => {
  it('uses an explicit 36h window constant', () => {
    expect(MARKETS_MAX_ARTICLE_AGE_MS).toBe(36 * 60 * 60 * 1000);
  });

  it('accepts recent and rejects older than max age', () => {
    const now = new Date('2026-09-12T18:00:00Z');
    expect(
      isWithinMarketsAgeWindow(new Date('2026-09-12T12:00:00Z'), now),
    ).toBe(true);
    expect(
      isWithinMarketsAgeWindow(new Date('2026-09-10T12:00:00Z'), now),
    ).toBe(false);
  });
});

describe('evaluateMarketsNewsRelevance — accepts (tickerless OK)', () => {
  it('accepts Fed rate decision with empty tickers', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Federal Reserve holds rates steady after FOMC meeting',
      description: 'Powell signals caution on future rate cuts.',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.relevanceClass).toBe('macro_equity');
    expect(r.reasons).toContain('fed_rates');
    expect(r.editorialBucket).toBe('fed_rates');
  });

  it('accepts Treasury yield shock', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Treasury yields surge as bond market prices in hotter growth',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('fed_rates');
  });

  it('accepts CPI surprise', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'US CPI jumps more than expected, reigniting inflation fears',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('inflation_economy');
  });

  it('accepts oil spike due to conflict', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Oil prices spike after Saudi pipeline attack raises supply risks',
      description: 'Crude oil markets react to Middle East disruption.',
      tickers: [],
      tags: ['oil'],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons.some((x) => x === 'oil_energy' || x === 'geopolitics_market_impact')).toBe(
      true,
    );
  });

  it('accepts tariff escalation', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'White House unveils new tariffs in escalating trade war with Canada',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('geopolitics_market_impact');
  });

  it('accepts broad market selloff', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'S&P 500 and Nasdaq plunge as Wall Street risk-off intensifies',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('broad_market');
  });

  it('accepts banking-system stress', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Regional banks face deposit flight as credit stress mounts',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('banking_credit');
  });

  it('accepts IPO pipeline event', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'US IPO Weekly Recap: Small issuers join the pipeline as window reopens',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('ipo_capital_markets');
  });

  it('accepts jobs report / payrolls', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Nonfarm payrolls miss estimates as unemployment ticks higher',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('inflation_economy');
  });
  it('accepts Fed hike phrasing without the word rate', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'A Fed Hike Is a Done Deal. Stocks Still Have Big Hurdles.',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('fed_rates');
  });

  it('accepts consumer sentiment print', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Consumer Sentiment Is Lower in September, per Michigan Survey',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(r.reasons).toContain('inflation_economy');
  });
  it('accepts Iran oil-flow escalation', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'U.S.-Iran Escalation to Delay Oil Flow Recovery Into Next Year, IEA Says',
      tickers: [],
    });
    expect(r.accepted).toBe(true);
    expect(
      r.reasons.some((x) => x === 'oil_energy' || x === 'geopolitics_market_impact'),
    ).toBe(true);
  });

  it('accepts consumer prices ahead of Fed meeting', () => {
    const r = evaluateMarketsNewsRelevance({
      title: "Consumer prices remained elevated in August ahead of Fed's next meeting",
      tickers: [],
    });
    expect(r.accepted).toBe(true);
  });
});

describe('evaluateMarketsNewsRelevance — rejects', () => {
  it('rejects should-you-buy stock pick', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Should You Buy Alphabet Stock Right Now?',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('stock_pick_opinion');
  });

  it('rejects 3 stocks to hold forever', () => {
    const r = evaluateMarketsNewsRelevance({
      title: '3 Stocks to Hold Forever in Any Market',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('stock_pick_opinion');
  });

  it('rejects personal finance', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Budgeting tips: how to invest your first $1,000',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('personal_finance');
  });

  it('rejects lifestyle', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Celebrity fashion week looks that stole the show',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('lifestyle');
  });

  it('rejects tickerless single-name opinion without market signal', () => {
    const r = evaluateMarketsNewsRelevance({
      title: "Snap's Growth Metrics Warrant A Risk Capital Bet",
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toMatch(/single_name_opinion|stock_pick_opinion/);
  });

  it('rejects Seeking Alpha colon single-name without market signal', () => {
    const r = evaluateMarketsNewsRelevance({
      title: "Entergy's Next Growth Engine Is Already Connected",
      description: 'Utility commentary without macro framing.',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(['single_name_opinion', 'no_market_signal']).toContain(r.reasons[0]);
  });

  it('rejects single-name title even if description mentions rates', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Lakeland: The Number Moved, Just Not Enough',
      description: 'Management discussed tariffs and interest rates casually.',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('single_name_opinion');
  });

  it('rejects pharma human-interest without tape impact', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Heart Disease, a Historic Strength for Big Pharma, Becomes a Weakness',
      description: 'Wall Street watches the sector.',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('sector_human_interest');
  });

  it('rejects buyer-on-weakness stock opinion', () => {
    const r = evaluateMarketsNewsRelevance({
      title: "Reasons Why I'm A Buyer On Stock Market Weakness",
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('stock_pick_opinion');
  });

  it('rejects generic investing education', () => {
    const r = evaluateMarketsNewsRelevance({
      title: "Beginner's guide to how the stock market works",
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('generic_investing_education');
  });

  it('rejects no-signal geopolitics-free politics', () => {
    const r = evaluateMarketsNewsRelevance({
      title: 'Canadian boycott of US products pushes grocers to adapt',
      tickers: [],
    });
    expect(r.accepted).toBe(false);
    expect(r.reasons[0]).toBe('no_market_signal');
  });
});

describe('hasSingleNameTitleShape', () => {
  it("does not treat Fed's or Here's as single-name titles", () => {
    expect(hasSingleNameTitleShape("Fed's next meeting could move markets")).toBe(false);
    expect(hasSingleNameTitleShape("Here's what to know about CPI")).toBe(false);
    expect(hasSingleNameTitleShape("Snap's Growth Metrics Warrant A Risk Capital Bet")).toBe(
      true,
    );
  });
});

describe('looksLikeSingleNameContamination', () => {
  it('is false when a market signal is present on a clean title', () => {
    expect(
      looksLikeSingleNameContamination({
        title: 'Oil prices spike on pipeline attack',
        hasMarketSignal: true,
        titleHasMarketSignal: true,
      }),
    ).toBe(false);
  });
});

describe('stock news client — category/general', () => {
  it('builds /category?section=general without leaking token in errors', async () => {
    const token = 'secret-token-value-xyz';
    const fetchImpl = vi.fn(async (url: string) => {
      expect(String(url)).toContain(`${STOCK_NEWS_API_BASE}/category`);
      expect(String(url)).toContain('section=general');
      expect(String(url)).toContain('type=article');
      expect(String(url)).toContain('extra-fields=');
      expect(String(url)).toContain('token=');
      return new Response(
        JSON.stringify({
          data: [
            {
              title: 'The Fed Faces A Huge Credibility Test',
              news_url: 'https://example.com/fed',
              source_name: 'Seeking Alpha',
              date: 'Sat, 12 Sep 2026 07:05:00 -0400',
              topics: ['paylimitwall'],
              sentiment: 'Neutral',
              type: 'Article',
              news_id: 3919867,
              text: 'Federal Reserve policy credibility is under pressure.',
            },
          ],
          total_pages: 200,
          total_items: 10000,
        }),
        { status: 200 },
      );
    });

    const client = createStockNewsClient({
      token,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });
    const out = await client.fetchCategoryNews({
      section: 'general',
      items: 50,
      page: 1,
      type: 'article',
      extraFields: 'id,rankscore',
    });
    expect(out.articles).toHaveLength(1);
    expect(out.totalPages).toBe(200);
    expect(out.articles[0]?.title).toMatch(/Fed/i);

    await expect(
      createStockNewsClient({
        token,
        fetchImpl: (async () =>
          new Response(JSON.stringify({ message: `denied ${token}` }), {
            status: 403,
          })) as unknown as typeof fetch,
        maxRetries: 0,
      }).fetchCategoryNews({ section: 'general', items: 10 }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(String((err as Error).message)).not.toContain(token);
      return true;
    });
  });

  it('handles malformed category payload as empty list', async () => {
    const client = createStockNewsClient({
      token: 'tok',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ hello: 'world' }), { status: 200 })) as unknown as typeof fetch,
      maxRetries: 0,
    });
    const out = await client.fetchCategoryNews({ section: 'general', items: 5 });
    expect(out.articles).toEqual([]);
  });
});

describe('runMarketsDryRun — no writes', () => {
  it('never calls upsert/checkpoint and reports accept/reject', async () => {
    const upsert = vi.fn();
    const advance = vi.fn();
    const markAttempt = vi.fn();

    const now = new Date('2026-09-12T18:00:00Z');
    const fetchImpl = vi.fn(async (url: string) => {
      const u = String(url);
      expect(u).toContain('/category');
      const page = Number(new URL(u).searchParams.get('page') ?? '1');
      if (page > 1) {
        return new Response(JSON.stringify({ data: [], total_pages: 1, total_items: 2 }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              title: 'Federal Reserve signals rate cut path at FOMC',
              news_url: 'https://example.com/fed',
              source_name: 'reuters.com',
              date: 'Sat, 12 Sep 2026 10:00:00 -0400',
              topics: [],
              sentiment: 'Neutral',
              type: 'Article',
              news_id: 1,
              text: 'Interest rates may fall.',
            },
            {
              title: 'Should You Buy Nvidia Stock Right Now?',
              news_url: 'https://example.com/nvda',
              source_name: 'fool.com',
              date: 'Sat, 12 Sep 2026 09:00:00 -0400',
              topics: [],
              sentiment: 'Positive',
              type: 'Article',
              news_id: 2,
              text: 'Prediction piece.',
            },
            {
              title: 'Ancient evergreen from 2020',
              news_url: 'https://example.com/old',
              source_name: 'example.com',
              date: 'Mon, 01 Sep 2025 10:00:00 -0400',
              topics: [],
              type: 'Article',
              news_id: 3,
              text: 'Federal Reserve history.',
            },
          ],
          total_pages: 1,
          total_items: 3,
        }),
        { status: 200 },
      );
    });

    const client = createStockNewsClient({
      token: 'tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxRetries: 0,
    });

    const result = await runMarketsDryRun({
      client,
      now,
      targetCount: 50,
      maxPages: 2,
      sampleLimit: 10,
      overlapLookup: {
        lookupArticleIds: async (ids) => {
          // Prove dry-run can read overlap without writers.
          expect(upsert).not.toHaveBeenCalled();
          expect(advance).not.toHaveBeenCalled();
          expect(markAttempt).not.toHaveBeenCalled();
          const map = new Map();
          for (const id of ids) {
            map.set(id, { exists: false, stocksEligible: false });
          }
          return map;
        },
      },
    });

    expect(result.fetched).toBe(3);
    expect(result.withinAgeWindow).toBe(2);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.acceptedSamples[0]?.title).toMatch(/Federal Reserve/i);
    expect(result.rejectedSamples[0]?.reasons[0]).toBe('stock_pick_opinion');
    expect(upsert).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expect(markAttempt).not.toHaveBeenCalled();

    const report = formatMarketsDryRunReport(result);
    expect(report).toContain('MARKETS DRY RUN');
    expect(report).toContain('ACCEPT');
    expect(report).toContain('REJECT');
  });
});
