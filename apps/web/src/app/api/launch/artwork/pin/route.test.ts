import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { META_LIMITS } from '@/lib/launch/types';
import { TOKEN_IMAGE_SQUARE_ERROR } from '@/lib/launch/image-dimensions';

const squarePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4oaGBFTEMLQkAgl1GAXRgBQ4AAAAASUVORK5CYII=',
  'base64',
);
const landscapePng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWM4oaFBEmIY1aAxGEIJAAxxnYHF8mvxAAAAAElFTkSuQmCC',
  'base64',
);
const portraitPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAQCAIAAABLKsIUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWM4oaGBCzGMyp0Y7OECADPWnYHPeEwoAAAAAElFTkSuQmCC',
  'base64',
);

const pinArtwork = vi.fn(async () => ({
  ipfsUri: 'ipfs://bafySquareCid0000000000000000000001',
  cid: 'bafySquareCid0000000000000000000001',
}));

vi.mock('@/lib/auth/session', () => ({
  readSessionFromRequest: () => ({ address: '0xabc' }),
}));

vi.mock('@/lib/server/internal-auth', () => ({
  clientIp: () => '127.0.0.1',
  rateLimitInternal: () => true,
}));

vi.mock('@/lib/launch/ipfs-pinata', () => ({
  isPinataConfigured: () => true,
  createLaunchArtworkPinner: () => ({ pinArtwork }),
}));

vi.mock('@scoop/news', () => ({
  buildManualTokenDisplayImagePath: () =>
    'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
  createSupabaseTokenImageStorage: () => ({
    uploadDisplayCopy: vi.fn(async () => ({
      path: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      publicUrl: 'https://example.test/token-image/x.png',
    })),
  }),
  validateTokenDisplayImage: vi.fn(),
}));

vi.mock('@/lib/launch/record-display-finalize-intent', () => ({
  recordDisplayFinalizeIntent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/queries', () => ({
  serverDb: () => ({}),
}));

vi.mock('@/lib/server/validate', () => ({
  assertNoSecretLeakage: () => undefined,
}));

describe('POST /api/launch/artwork/pin square gate', () => {
  beforeEach(() => {
    pinArtwork.mockClear();
    process.env.NODE_ENV = 'development';
  });

  async function post(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/launch/artwork/pin/route');
    const req = new NextRequest('http://localhost/api/launch/artwork/pin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it('accepts square PNG and pins', async () => {
    const res = await post({
      bytesBase64: squarePng.toString('base64'),
      mimeType: 'image/png',
      fileName: 'sq.png',
    });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(pinArtwork).toHaveBeenCalledOnce();
  });

  it('rejects landscape before pin', async () => {
    const res = await post({
      bytesBase64: landscapePng.toString('base64'),
      mimeType: 'image/png',
      fileName: 'wide.png',
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe('VALIDATION');
    expect(json.error).toBe(TOKEN_IMAGE_SQUARE_ERROR);
    expect(pinArtwork).not.toHaveBeenCalled();
  });

  it('rejects portrait before pin', async () => {
    const res = await post({
      bytesBase64: portraitPng.toString('base64'),
      mimeType: 'image/png',
      fileName: 'tall.png',
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toBe(TOKEN_IMAGE_SQUARE_ERROR);
    expect(pinArtwork).not.toHaveBeenCalled();
  });

  it('ignores client dimension claims (bytes decide)', async () => {
    const res = await post({
      bytesBase64: landscapePng.toString('base64'),
      mimeType: 'image/png',
      // Spoof fields — route must not accept width/height even if present
      width: 1024,
      height: 1024,
    });
    const json = await res.json();
    expect(json.error).toBe(TOKEN_IMAGE_SQUARE_ERROR);
    expect(pinArtwork).not.toHaveBeenCalled();
  });

  it('keeps MIME and 5 MiB rejection', async () => {
    const badMime = await post({
      bytesBase64: squarePng.toString('base64'),
      mimeType: 'image/gif',
    });
    expect((await badMime.json()).error).toMatch(/PNG|JPEG|WebP/i);
    expect(pinArtwork).not.toHaveBeenCalled();

    const over = Buffer.alloc(META_LIMITS.imageFileMaxBytes + 1, 1);
    // Still a PNG header prefix so we prove size gate runs (or fails decode);
    // size check happens before square check.
    over[0] = 0x89;
    over[1] = 0x50;
    const big = await post({
      bytesBase64: over.toString('base64'),
      mimeType: 'image/png',
    });
    expect((await big.json()).error).toMatch(/size/i);
    expect(pinArtwork).not.toHaveBeenCalled();
  });
});
