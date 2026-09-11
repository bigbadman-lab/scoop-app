import { describe, expect, it, vi } from 'vitest';
import { isOgSafeLogoUrl, loadOgLogoDataUri } from '@/lib/media/og-safe-image';

describe('isOgSafeLogoUrl', () => {
  it('allows known public hosts', () => {
    expect(isOgSafeLogoUrl('https://ipfs.io/ipfs/bafybeiabc')).toBe(true);
    expect(
      isOgSafeLogoUrl(
        'https://xyz.supabase.co/storage/v1/object/public/token-images/a.png',
      ),
    ).toBe(true);
    expect(isOgSafeLogoUrl('https://scoop.fun/brand/MARK.png')).toBe(true);
  });

  it('rejects unsafe or private targets', () => {
    expect(isOgSafeLogoUrl('http://ipfs.io/ipfs/x')).toBe(false);
    expect(isOgSafeLogoUrl('https://evil.example/a.png')).toBe(false);
    expect(isOgSafeLogoUrl('https://127.0.0.1/secret')).toBe(false);
    expect(isOgSafeLogoUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isOgSafeLogoUrl('https://localhost/a.png')).toBe(false);
    expect(isOgSafeLogoUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('loadOgLogoDataUri', () => {
  it('returns null for non-allowlisted candidates without fetching', async () => {
    const fetchImpl = vi.fn();
    await expect(
      loadOgLogoDataUri('https://evil.example/a.png', fetchImpl as unknown as typeof fetch),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a data URI for allowlisted image bytes', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    });
    const dataUri = await loadOgLogoDataUri(
      'https://ipfs.io/ipfs/bafybeiabc',
      fetchImpl as unknown as typeof fetch,
    );
    expect(dataUri?.startsWith('data:image/png;base64,')).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns null when fetch fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network'));
    await expect(
      loadOgLogoDataUri(
        'https://ipfs.io/ipfs/bafybeiabc',
        fetchImpl as unknown as typeof fetch,
      ),
    ).resolves.toBeNull();
  });
});
