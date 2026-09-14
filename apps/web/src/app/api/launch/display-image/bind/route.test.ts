import { beforeEach, describe, expect, it, vi } from 'vitest';

const bindAndFinalizeTokenDisplayImage = vi.fn();
const upsertNewsArticleMarketIntentAndLink = vi.fn();
const readSessionFromRequest = vi.fn();
const rateLimitInternal = vi.fn(() => true);
const serverDb = vi.fn(() => ({ query: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({
  readSessionFromRequest: (...args: unknown[]) => readSessionFromRequest(...args),
}));

vi.mock('@/lib/server/queries', () => ({
  serverDb: (...args: unknown[]) => serverDb(...args),
}));

vi.mock('@/lib/server/internal-auth', () => ({
  clientIp: () => '127.0.0.1',
  rateLimitInternal: (...args: unknown[]) => rateLimitInternal(...args),
}));

vi.mock('@/lib/launch/bind-token-display-image', () => ({
  bindAndFinalizeTokenDisplayImage: (...args: unknown[]) =>
    bindAndFinalizeTokenDisplayImage(...args),
}));

vi.mock('@scoop/db', async () => {
  const actual = await vi.importActual<typeof import('@scoop/db')>('@scoop/db');
  return {
    ...actual,
    upsertNewsArticleMarketIntentAndLink: (...args: unknown[]) =>
      upsertNewsArticleMarketIntentAndLink(...args),
  };
});

import { POST } from '@/app/api/launch/display-image/bind/route';

const TOKEN = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DRAFT = '5b992fb0-dc38-4ae7-9aca-e58ba3b8ae08';
const IPFS = 'ipfs://bafkreiclg5m2graeqq2u3ghkztzhcirx53yrrol24q73fps5garpb7s7o4';

describe('POST /api/launch/display-image/bind news dual-write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitInternal.mockReturnValue(true);
    readSessionFromRequest.mockReturnValue({
      address: TOKEN,
      chainId: 4663,
    });
    upsertNewsArticleMarketIntentAndLink.mockResolvedValue({
      ok: true,
      linked: true,
      intent: { status: 'done' },
    });
  });

  it('KEY regression: dual-writes news intent from result.draftId when body omits draftId', async () => {
    bindAndFinalizeTokenDisplayImage.mockResolvedValue({
      ok: true,
      displayImageUrl: 'https://proj.supabase.co/storage/v1/object/public/token-image/manual/x.png',
      bound: true,
      finalized: true,
      intentId: 'intent-key',
      draftId: DRAFT,
      source: 'path',
      tokenRowPresent: true,
    });

    const res = await POST(
      new Request('http://localhost/api/launch/display-image/bind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chainId: 4663,
          tokenAddress: TOKEN,
          imageUri: IPFS,
          // Client provenance gap: no draftId
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertNewsArticleMarketIntentAndLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chainId: 4663,
        tokenAddress: TOKEN,
        draftId: DRAFT,
      }),
    );
  });

  it('prefers body draftId over result draftId', async () => {
    const BODY_DRAFT = '11111111-1111-1111-1111-111111111111';
    bindAndFinalizeTokenDisplayImage.mockResolvedValue({
      ok: true,
      displayImageUrl: 'https://proj.supabase.co/storage/v1/object/public/token-image/manual/x.png',
      bound: true,
      finalized: true,
      intentId: 'intent-1',
      draftId: DRAFT,
      source: 'path',
      tokenRowPresent: true,
    });

    const res = await POST(
      new Request('http://localhost/api/launch/display-image/bind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chainId: 4663,
          tokenAddress: TOKEN,
          imageUri: IPFS,
          draftId: BODY_DRAFT,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertNewsArticleMarketIntentAndLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ draftId: BODY_DRAFT }),
    );
  });

  it('skips news dual-write when neither body nor intent has draftId', async () => {
    bindAndFinalizeTokenDisplayImage.mockResolvedValue({
      ok: true,
      displayImageUrl: 'https://proj.supabase.co/storage/v1/object/public/token-image/manual/x.png',
      bound: true,
      finalized: true,
      intentId: 'intent-manual',
      draftId: null,
      source: 'path',
      tokenRowPresent: true,
    });

    const res = await POST(
      new Request('http://localhost/api/launch/display-image/bind', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chainId: 4663,
          tokenAddress: TOKEN,
          imageUri: IPFS,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertNewsArticleMarketIntentAndLink).not.toHaveBeenCalled();
  });
});
