import { describe, expect, it, vi } from 'vitest';
import { ensureTokenDisplayImage } from '@/lib/launch/ensure-display-image';

describe('ensureTokenDisplayImage', () => {
  it('noops without draft or path', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await ensureTokenDisplayImage({
      chainId: 4663,
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      fetchImpl,
    });
    expect(result).toEqual({ ok: true, status: 'noop' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts to bind endpoint with path and imageUri', async () => {
    const fetchImpl = vi.fn(async (url, init?: RequestInit) => {
      expect(url).toBe('/api/launch/display-image/bind');
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        displayImagePath?: string;
        draftId?: string;
        imageUri?: string;
      };
      expect(body.displayImagePath).toBe(
        'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      );
      expect(body.draftId).toBe('draft-ai-should-not-apply');
      expect(body.imageUri).toBe('ipfs://bafybeiabc');
      expect(init?.keepalive).toBe(true);
      return Response.json({
        ok: true,
        displayImageUrl:
          'https://proj.supabase.co/storage/v1/object/public/token-image/manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
        finalized: true,
        source: 'path',
      });
    }) as unknown as typeof fetch;

    const result = await ensureTokenDisplayImage({
      chainId: 4663,
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      sourceDraftId: 'draft-ai-should-not-apply',
      imageUri: 'ipfs://bafybeiabc',
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      status: 'applied',
      source: 'path',
      displayImageUrl:
        'https://proj.supabase.co/storage/v1/object/public/token-image/manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      finalized: true,
      uploaded: false,
    });
  });

  it('falls back to finalize IPFS mirror when bind finds no intent', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === '/api/launch/display-image/bind') {
        return Response.json(
          { ok: false, error: 'intent not found', code: 'INTENT_NOT_FOUND' },
          { status: 409 },
        );
      }
      expect(url).toBe('/api/launch/display-image');
      return Response.json({
        ok: true,
        status: 'applied',
        source: 'ipfs_fallback',
        uploaded: true,
        displayImageUrl:
          'https://proj.supabase.co/storage/v1/object/public/token-image/canonical/x/x.webp',
      });
    }) as unknown as typeof fetch;

    const result = await ensureTokenDisplayImage({
      chainId: 4663,
      tokenAddress: '0x4d35b131c2463ffb9cb2435e6df85d287f494b8b',
      imageUri: 'ipfs://bafybeig2qhiu4c7oeddmivtvjjdawkasc3jf35643cusg64cdbvy2ncmwa',
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      status: 'applied',
      source: 'ipfs_fallback',
      uploaded: true,
      displayImageUrl:
        'https://proj.supabase.co/storage/v1/object/public/token-image/canonical/x/x.webp',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
