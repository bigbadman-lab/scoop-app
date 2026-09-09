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

  it('omits draftId when manual path is present', async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        displayImagePath?: string;
        draftId?: string;
      };
      expect(body.displayImagePath).toBe(
        'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      );
      expect(body.draftId).toBeUndefined();
      return Response.json({ ok: true, status: 'applied' });
    }) as unknown as typeof fetch;

    const result = await ensureTokenDisplayImage({
      chainId: 4663,
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      sourceDraftId: 'draft-ai-should-not-apply',
      fetchImpl,
    });
    expect(result).toEqual({ ok: true, status: 'applied' });
  });

  it('posts draftId when path absent', async () => {
    const fetchImpl = vi.fn(async (_url, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        draftId?: string;
        displayImagePath?: string;
      };
      expect(body.draftId).toBe('draft-1');
      expect(body.displayImagePath).toBeUndefined();
      return Response.json({ ok: true, status: 'skipped' });
    }) as unknown as typeof fetch;

    await ensureTokenDisplayImage({
      chainId: 4663,
      tokenAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sourceDraftId: 'draft-1',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
