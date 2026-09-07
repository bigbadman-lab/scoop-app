import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateLaunchConcepts = vi.fn();
const getNewsArticleForConcepts = vi.fn();
const createPool = vi.fn();
const loadEnabledQuoteCatalogue = vi.fn();
const resolveLaunchAssistAccess = vi.fn();
const rateLimitInternal = vi.fn();
const clientIp = vi.fn();

vi.mock('@scoop/db', () => ({
  createPool: (...args: unknown[]) => createPool(...args),
}));

vi.mock('@scoop/news', () => {
  class ConceptValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConceptValidationError';
    }
  }
  return {
    ConceptValidationError,
    generateLaunchConcepts: (...args: unknown[]) => generateLaunchConcepts(...args),
    getNewsArticleForConcepts: (...args: unknown[]) => getNewsArticleForConcepts(...args),
  };
});

vi.mock('@/lib/launch-assist/access', () => ({
  resolveLaunchAssistAccess: (...args: unknown[]) => resolveLaunchAssistAccess(...args),
}));

vi.mock('@/lib/quotes/catalogue', () => ({
  loadEnabledQuoteCatalogue: (...args: unknown[]) => loadEnabledQuoteCatalogue(...args),
}));

vi.mock('@/lib/server/internal-auth', () => ({
  rateLimitInternal: (...args: unknown[]) => rateLimitInternal(...args),
  clientIp: (...args: unknown[]) => clientIp(...args),
  assertInternalAccess: vi.fn(),
}));

const quoteAddress = '0x1111111111111111111111111111111111111111';

function sampleConcept(id: 'concept_1' | 'concept_2' | 'concept_3', name: string) {
  return {
    id,
    name,
    ticker: name.slice(0, 4).toUpperCase(),
    description: `${name} description`,
    recommendedPairAddress: quoteAddress,
    recommendedPairSymbol: 'NVDA',
    pairRationale: 'Tied to the story',
    imageDirection: 'editorial photo',
  };
}

describe('POST /api/launch-assist/concepts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://test';
    resolveLaunchAssistAccess.mockReturnValue({ ok: true, mode: 'development' });
    rateLimitInternal.mockReturnValue(true);
    clientIp.mockReturnValue('127.0.0.1');
    createPool.mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{ url: 'https://reuters.com/a' }] }),
      end: vi.fn().mockResolvedValue(undefined),
    });
    getNewsArticleForConcepts.mockResolvedValue({
      providerArticleId: '77',
      headline: 'Rate decision',
      description: 'Body text that must stay server-side',
      sourceDomain: 'reuters.com',
      publishedAt: '2026-09-07T12:00:00.000Z',
      crawledAt: '2026-09-07T12:01:00.000Z',
      tickers: ['NVDA'],
      tags: [],
    });
    loadEnabledQuoteCatalogue.mockResolvedValue([
      {
        quoteAsset: quoteAddress,
        displaySymbol: 'NVDA',
        name: 'NVIDIA',
        imageUrl: '/quotes/nvda.png',
      },
    ]);
    generateLaunchConcepts.mockResolvedValue({
      response: {
        article: { providerArticleId: '77', headline: 'Rate decision' },
        concepts: [
          sampleConcept('concept_1', 'Rate Spike'),
          sampleConcept('concept_2', 'Fed Fade'),
          sampleConcept('concept_3', 'Desk Heat'),
        ],
      },
      usage: {
        model: 'gpt-test',
        latencyMs: 10,
        inputTokens: 1,
        outputTokens: 2,
        repairAttempted: false,
      },
      enabledQuotes: [],
    });
  });

  it('rejects missing providerArticleId', async () => {
    const { POST } = await import('@/app/api/launch-assist/concepts/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    expect(generateLaunchConcepts).not.toHaveBeenCalled();
  });

  it('rejects client-supplied article text', async () => {
    const { POST } = await import('@/app/api/launch-assist/concepts/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerArticleId: '77',
          headline: 'Injected',
          articleText: 'malicious',
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/providerArticleId/i);
    expect(generateLaunchConcepts).not.toHaveBeenCalled();
  });

  it('returns AUTH_REQUIRED when access is denied', async () => {
    resolveLaunchAssistAccess.mockReturnValue({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Launch assist requires product authentication',
    });
    const { POST } = await import('@/app/api/launch-assist/concepts/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(generateLaunchConcepts).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    rateLimitInternal.mockReturnValue(false);
    const { POST } = await import('@/app/api/launch-assist/concepts/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77' }),
      }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMITED');
    expect(JSON.stringify(body)).not.toContain('OPENAI');
  });

  it('returns exactly 3 public concepts without leaking internals', async () => {
    const { POST } = await import('@/app/api/launch-assist/concepts/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(generateLaunchConcepts).toHaveBeenCalledWith(
      { providerArticleId: '77' },
      expect.objectContaining({ article: expect.objectContaining({ providerArticleId: '77' }) }),
    );
    const body = await res.json();
    expect(body.concepts).toHaveLength(3);
    expect(body.article.headline).toBe('Rate decision');
    expect(body.article).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('usage');
    expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
    expect(JSON.stringify(body)).not.toContain('OPENAI_API_KEY');
    expect(JSON.stringify(body)).not.toContain('SCOOP_INTERNAL_API_SECRET');
    expect(JSON.stringify(body)).not.toContain('Body text that must stay server-side');
  });
});
