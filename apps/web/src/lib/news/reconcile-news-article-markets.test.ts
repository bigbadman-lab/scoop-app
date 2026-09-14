import { describe, expect, it, vi } from 'vitest';
import { reconcileNewsArticleMarkets } from '@/lib/news/reconcile-news-article-markets';

vi.mock('@scoop/db', async () => {
  const actual = await vi.importActual<typeof import('@scoop/db')>('@scoop/db');
  return {
    ...actual,
    expireStaleNewsArticleMarketIntents: vi.fn(),
    listPendingNewsArticleMarketIntents: vi.fn(),
    linkNewsArticleMarket: vi.fn(),
    markNewsArticleMarketIntentResult: vi.fn(),
    bumpNewsArticleMarketIntentAttempt: vi.fn(),
  };
});

import {
  bumpNewsArticleMarketIntentAttempt,
  expireStaleNewsArticleMarketIntents,
  linkNewsArticleMarket,
  listPendingNewsArticleMarketIntents,
  markNewsArticleMarketIntentResult,
} from '@scoop/db';

const expire = vi.mocked(expireStaleNewsArticleMarketIntents);
const listPending = vi.mocked(listPendingNewsArticleMarketIntents);
const link = vi.mocked(linkNewsArticleMarket);
const mark = vi.mocked(markNewsArticleMarketIntentResult);
const bump = vi.mocked(bumpNewsArticleMarketIntentAttempt);

const pendingIntent = {
  id: 'intent-1',
  chainId: 4663,
  tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  provider: 'stocknewsapi',
  providerArticleId: 'art-1',
  draftId: 'draft-1',
  status: 'pending' as const,
  attempts: 1,
  lastError: 'launch_not_indexed',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('reconcileNewsArticleMarkets', () => {
  it('links pending intents once launch is indexed', async () => {
    expire.mockResolvedValue(0);
    listPending.mockResolvedValue([pendingIntent]);
    link.mockResolvedValue({ linked: true });
    mark.mockResolvedValue({ ...pendingIntent, status: 'done' });

    const summary = await reconcileNewsArticleMarkets({
      db: {} as never,
    });

    expect(summary).toEqual({
      pendingScanned: 1,
      linked: 1,
      stillPending: 0,
      failed: 0,
      expired: 0,
    });
    expect(mark).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'intent-1', status: 'done' }),
    );
  });

  it('keeps pending on transient launch_not_indexed', async () => {
    expire.mockResolvedValue(0);
    listPending.mockResolvedValue([pendingIntent]);
    link.mockResolvedValue({ linked: false, reason: 'launch_not_indexed' });
    bump.mockResolvedValue({ ...pendingIntent, attempts: 2 });

    const summary = await reconcileNewsArticleMarkets({
      db: {} as never,
    });

    expect(summary.stillPending).toBe(1);
    expect(summary.linked).toBe(0);
    expect(bump).toHaveBeenCalled();
  });

  it('marks hard failures without infinite retry', async () => {
    expire.mockResolvedValue(1);
    listPending.mockResolvedValue([pendingIntent]);
    link.mockResolvedValue({ linked: false, reason: 'article_not_found' });
    mark.mockResolvedValue({ ...pendingIntent, status: 'failed' });

    const summary = await reconcileNewsArticleMarkets({
      db: {} as never,
    });

    expect(summary).toMatchObject({
      failed: 1,
      expired: 1,
      linked: 0,
    });
    expect(mark).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed', lastError: 'article_not_found' }),
    );
  });
});
