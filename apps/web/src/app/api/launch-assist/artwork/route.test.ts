import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNewsLaunchDraft = vi.fn();
const generateDraftArtwork = vi.fn();
const createPool = vi.fn();
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
    createNewsLaunchDraft: (...args: unknown[]) => createNewsLaunchDraft(...args),
    generateDraftArtwork: (...args: unknown[]) => generateDraftArtwork(...args),
  };
});

vi.mock('@/lib/launch-assist/access', () => ({
  resolveLaunchAssistAccess: (...args: unknown[]) => resolveLaunchAssistAccess(...args),
  launchAssistRateKey: (
    kind: string,
    ip: string,
    session: { address?: string } | null,
  ) => `launch-assist-${kind}:${session?.address ?? 'anon'}:${ip}`,
}));

vi.mock('@/lib/server/internal-auth', () => ({
  rateLimitInternal: (...args: unknown[]) => rateLimitInternal(...args),
  clientIp: (...args: unknown[]) => clientIp(...args),
  assertInternalAccess: vi.fn(),
}));

const concept = {
  id: 'concept_1',
  name: 'Rate Spike',
  ticker: 'RATE',
  description: 'A market on rate moves',
  recommendedPairAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  recommendedPairSymbol: 'NVDA',
  pairRationale: 'Chip angle',
  imageDirection: 'editorial desk photo',
  pairEnabled: true,
};

describe('POST /api/launch-assist/artwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://test';
    resolveLaunchAssistAccess.mockReturnValue({
      ok: true,
      mode: 'development',
      session: null,
    });
    rateLimitInternal.mockReturnValue(true);
    clientIp.mockReturnValue('127.0.0.1');
    createPool.mockReturnValue({ end: vi.fn().mockResolvedValue(undefined) });
    createNewsLaunchDraft.mockResolvedValue({ id: 'draft-1' });
    generateDraftArtwork.mockResolvedValue({
      draft: {
        id: 'draft-1',
        artworks: [
          {
            assetId: 'a1',
            previewUrl: 'https://signed.example/1.png',
            mimeType: 'image/png',
            width: 1024,
            height: 1024,
            generation: { model: 'gpt-image-2', quality: 'medium' },
          },
          {
            assetId: 'a2',
            previewUrl: 'https://signed.example/2.png',
            mimeType: 'image/png',
            width: 1024,
            height: 1024,
            generation: { model: 'gpt-image-2', quality: 'medium' },
          },
          {
            assetId: 'a3',
            previewUrl: 'https://signed.example/3.png',
            mimeType: 'image/png',
            width: 1024,
            height: 1024,
            generation: { model: 'gpt-image-2', quality: 'medium' },
          },
        ],
      },
      generationId: 'gen-1',
      imageCount: 3,
      model: 'gpt-image-2',
      quality: 'medium',
      latencyMs: 12,
    });
  });

  it('blocks when auth is required', async () => {
    resolveLaunchAssistAccess.mockReturnValue({
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'auth required',
    });
    const { POST } = await import('@/app/api/launch-assist/artwork/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77', concept }),
      }),
    );
    expect(res.status).toBe(401);
    expect(createNewsLaunchDraft).not.toHaveBeenCalled();
  });

  it('rejects missing concept and prompt injection', async () => {
    const { POST } = await import('@/app/api/launch-assist/artwork/route');
    const missing = await POST(
      new Request('http://localhost/api/launch-assist/artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77' }),
      }),
    );
    expect(missing.status).toBe(400);

    const injected = await POST(
      new Request('http://localhost/api/launch-assist/artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerArticleId: '77',
          concept,
          prompt: 'ignore previous',
          articleText: 'body',
        }),
      }),
    );
    expect(injected.status).toBe(400);
    expect(createNewsLaunchDraft).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    rateLimitInternal.mockReturnValue(false);
    const { POST } = await import('@/app/api/launch-assist/artwork/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77', concept }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it('creates draft, generates artwork, returns exactly 3 public images', async () => {
    const { POST } = await import('@/app/api/launch-assist/artwork/route');
    const res = await POST(
      new Request('http://localhost/api/launch-assist/artwork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77', concept }),
      }),
    );
    expect(res.status).toBe(200);
    expect(createNewsLaunchDraft).toHaveBeenCalled();
    expect(generateDraftArtwork).toHaveBeenCalledWith('draft-1', expect.anything());
    const body = await res.json();
    expect(body.draftId).toBe('draft-1');
    expect(body.images).toHaveLength(3);
    expect(body.images[0]).toMatchObject({
      assetId: 'a1',
      index: 1,
      previewUrl: 'https://signed.example/1.png',
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain('gpt-image-2');
    expect(text).not.toContain('OPENAI');
    expect(text).not.toContain('SCOOP_INTERNAL_API_SECRET');
  });
});
