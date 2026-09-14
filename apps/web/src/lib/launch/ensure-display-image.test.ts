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

  it('posts imageUri to bind without waiting for index', async () => {
    const fetchImpl = vi.fn(async (url, init?: RequestInit) => {
      expect(url).toBe('/api/launch/display-image/bind');
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        imageUri?: string;
        waitForIndex?: boolean;
      };
      expect(body.imageUri).toBe('ipfs://bafybeiabc');
      expect(body.waitForIndex).toBeUndefined();
      return Response.json({
        ok: true,
        displayImageUrl:
          'https://proj.supabase.co/storage/v1/object/public/token-image/manual/aa/aa.png',
        finalized: false,
        source: 'path',
      });
    }) as unknown as typeof fetch;

    const result = await ensureTokenDisplayImage({
      chainId: 4663,
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      imageUri: 'ipfs://bafybeiabc',
      fetchImpl,
    });
    expect(result).toEqual({
      ok: true,
      status: 'skipped',
      source: 'path',
      displayImageUrl:
        'https://proj.supabase.co/storage/v1/object/public/token-image/manual/aa/aa.png',
      finalized: false,
      uploaded: false,
    });
  });
});
