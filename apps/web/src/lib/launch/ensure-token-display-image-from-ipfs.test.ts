import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyDisplayImagePathToToken = vi.fn();
const mirrorIpfsUriToTokenImage = vi.fn();
const createSupabaseTokenImageStorage = vi.fn(() => ({ kind: 'storage' }));

vi.mock('@scoop/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@scoop/db')>();
  return {
    ...actual,
    applyDisplayImagePathToToken: (...args: unknown[]) =>
      applyDisplayImagePathToToken(...args),
  };
});

vi.mock('@scoop/news', () => ({
  createSupabaseTokenImageStorage: () => createSupabaseTokenImageStorage(),
  mirrorIpfsUriToTokenImage: (...args: unknown[]) => mirrorIpfsUriToTokenImage(...args),
}));

import { ensureTokenDisplayImageFromIpfs } from '@/lib/launch/ensure-token-display-image-from-ipfs';

const TOKEN = '0x4d35b131c2463ffb9cb2435e6df85d287f494b8b';
const MANAGED =
  'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/canonical/cid/cid.webp';

describe('ensureTokenDisplayImageFromIpfs', () => {
  beforeEach(() => {
    applyDisplayImagePathToToken.mockReset();
    mirrorIpfsUriToTokenImage.mockReset();
    createSupabaseTokenImageStorage.mockClear();
  });

  it('skips mirror when managed display URL already present', async () => {
    const result = await ensureTokenDisplayImageFromIpfs({
      db: {} as never,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafybeig2qhiu4c7oeddmivtvjjdawkasc3jf35643cusg64cdbvy2ncmwa',
      existingDisplayImageUrl: MANAGED,
    });
    expect(result).toEqual({
      ok: true,
      displayImageUrl: MANAGED,
      status: 'already_present',
    });
    expect(mirrorIpfsUriToTokenImage).not.toHaveBeenCalled();
  });

  it('mirrors ipfs:// then writes RHC display_image_url', async () => {
    mirrorIpfsUriToTokenImage.mockResolvedValue({
      ok: true,
      publicUrl: MANAGED,
      path: 'canonical/cid/cid.webp',
      uploaded: true,
      mimeType: 'image/webp',
      cid: 'cid',
    });
    applyDisplayImagePathToToken.mockResolvedValue('applied');

    const result = await ensureTokenDisplayImageFromIpfs({
      db: {} as never,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: 'ipfs://bafybeig2qhiu4c7oeddmivtvjjdawkasc3jf35643cusg64cdbvy2ncmwa',
    });

    expect(result).toEqual({
      ok: true,
      displayImageUrl: MANAGED,
      status: 'applied',
    });
    expect(applyDisplayImagePathToToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chainId: 4663,
        tokenAddress: TOKEN,
        displayImageUrl: MANAGED,
      }),
    );
  });

  it('returns falsey reason when image uri missing', async () => {
    const result = await ensureTokenDisplayImageFromIpfs({
      db: {} as never,
      chainId: 4663,
      tokenAddress: TOKEN,
      imageUri: null,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_image_uri' });
  });
});
