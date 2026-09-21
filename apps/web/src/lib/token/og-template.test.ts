import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadTokenOgTemplateDataUri,
  resetTokenOgTemplateCache,
  TOKEN_OG_TEMPLATE_PUBLIC_PATH,
} from '@/lib/token/og-template';
import { buildTokenOgCardModel, tokenOpenGraphImagePath } from '@/lib/token/og-card';
import { pickTokenImageSrc } from '@/lib/media/resolve-token-image';

describe('loadTokenOgTemplateDataUri', () => {
  afterEach(() => {
    resetTokenOgTemplateCache();
  });

  it('loads the local PNG template from public/brand', async () => {
    const dataUri = await loadTokenOgTemplateDataUri();
    expect(dataUri?.startsWith('data:image/png;base64,')).toBe(true);
    expect(TOKEN_OG_TEMPLATE_PUBLIC_PATH).toBe('/brand/token-template2.png');
  });

  it('falls back to HTTPS fetch when filesystem paths miss', async () => {
    resetTokenOgTemplateCache();
    const png = Buffer.alloc(40, 0);
    png[0] = 0x89;
    png[1] = 0x50;
    png[2] = 0x4e;
    png[3] = 0x47;

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    });

    // Force FS miss by stubbing candidate paths via cwd outside the repo.
    const prevCwd = process.cwd();
    const tmp = await import('node:fs/promises').then(async (fs) => {
      const os = await import('node:os');
      const path = await import('node:path');
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'scoop-og-tmpl-'));
      return dir;
    });
    try {
      process.chdir(tmp);
      resetTokenOgTemplateCache();
      const dataUri = await loadTokenOgTemplateDataUri(
        fetchImpl as unknown as typeof fetch,
      );
      expect(dataUri?.startsWith('data:image/png;base64,')).toBe(true);
      expect(fetchImpl).toHaveBeenCalled();
    } finally {
      process.chdir(prevCwd);
      resetTokenOgTemplateCache();
    }
  });
});

describe('token OG image source selection', () => {
  const MUSE = '0x7c6b5347fa848121a8308dd12daca05171f5cbc5';

  it('prefers public display_image_url over IPFS image_uri', () => {
    const display =
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/drafts/x.png';
    const ipfs = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    expect(pickTokenImageSrc(display, ipfs)).toBe(display);
    const model = buildTokenOgCardModel({
      token: {
        tokenAddress: MUSE,
        name: 'Muse Mode',
        symbol: 'MUSE',
        displayImageUrl: display,
        imageUri: ipfs,
      },
      quotePairLabel: 'META',
    });
    expect(model.logoCandidateUrl).toBe(display);
  });

  it('does not emit raw ipfs.io when display image absent', () => {
    const ipfs = 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi';
    expect(pickTokenImageSrc(null, ipfs)).toBeNull();
  });

  it('metadata path points at the file-based opengraph-image route', () => {
    expect(tokenOpenGraphImagePath(MUSE)).toBe(
      `/token/${MUSE}/opengraph-image`,
    );
  });
});
