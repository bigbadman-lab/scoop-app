import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertPumpMarket = vi.fn();
const ensureNewsArticleMarketFromTrustedDraft = vi.fn();
const ensurePumpTokenDisplayImage = vi.fn();
const serverDb = vi.fn(() => ({ query: vi.fn() }));

vi.mock('@scoop/db', () => ({
  upsertPumpMarket: (...args: unknown[]) => upsertPumpMarket(...args),
  ensureNewsArticleMarketFromTrustedDraft: (...args: unknown[]) =>
    ensureNewsArticleMarketFromTrustedDraft(...args),
}));

vi.mock('@/lib/server/queries', () => ({
  serverDb: () => serverDb(),
}));

vi.mock('@/lib/launch/ensure-pump-token-display-image', () => ({
  ensurePumpTokenDisplayImage: (...args: unknown[]) =>
    ensurePumpTokenDisplayImage(...args),
}));

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const CREATOR = '2Q3bWY6ivR4UBhkTDCNjwGp74waAbaiYieNiX3Papcm4';
const SIG = '5'.repeat(88);

describe('POST /api/launch/pump/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertPumpMarket.mockResolvedValue({
      chainId: 900001,
      mint: MINT,
      signature: SIG,
      marketSource: 'pump',
      created: true,
    });
    ensureNewsArticleMarketFromTrustedDraft.mockResolvedValue({
      ok: true,
      skipped: false,
      linked: true,
      intent: { id: 'i1' },
    });
    ensurePumpTokenDisplayImage.mockResolvedValue({
      ok: true,
      displayImageUrl: 'https://cdn.example/img.png',
    });
  });

  it('calls ensureNewsArticleMarketFromTrustedDraft when draftId present', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/launch/pump/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: MINT,
          signature: SIG,
          creatorWallet: CREATOR,
          name: 'Rate Spike',
          symbol: 'RATE',
          description: 'A market on rate moves',
          imageUri: 'ipfs://img',
          draftId: 'draft-news-1',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(ensureNewsArticleMarketFromTrustedDraft).toHaveBeenCalledWith(
      expect.anything(),
      {
        chainId: 900001,
        tokenAddress: MINT,
        draftId: 'draft-news-1',
      },
    );
  });

  it('skips news ensure when draftId absent (manual Pump)', async () => {
    const { POST } = await import('./route');
    const res = await POST(
      new Request('http://localhost/api/launch/pump/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mint: MINT,
          signature: SIG,
          creatorWallet: CREATOR,
          name: 'Manual',
          symbol: 'MAN',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(ensureNewsArticleMarketFromTrustedDraft).not.toHaveBeenCalled();
  });
});
