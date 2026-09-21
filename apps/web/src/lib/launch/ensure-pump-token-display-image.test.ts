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

import { ensurePumpTokenDisplayImage } from '@/lib/launch/ensure-pump-token-display-image';

const MINT = 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu';
const MANAGED =
  'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/canonical/cid/cid.webp';

describe('ensurePumpTokenDisplayImage', () => {
  beforeEach(() => {
    applyDisplayImagePathToToken.mockReset();
    mirrorIpfsUriToTokenImage.mockReset();
    createSupabaseTokenImageStorage.mockClear();
  });

  it('skips mirror when managed display URL already present', async () => {
    const result = await ensurePumpTokenDisplayImage({
      db: {} as never,
      mint: MINT,
      imageUri: 'ipfs://bafkreiffc2vh75vzbn6e6lngg4m6jijhmqev426237fhjzcrjxfwfyqmvu',
      existingDisplayImageUrl: MANAGED,
    });
    expect(result).toEqual({
      ok: true,
      displayImageUrl: MANAGED,
      status: 'already_present',
    });
    expect(mirrorIpfsUriToTokenImage).not.toHaveBeenCalled();
  });

  it('mirrors ipfs:// then writes Solana-safe display_image_url', async () => {
    mirrorIpfsUriToTokenImage.mockResolvedValue({
      ok: true,
      publicUrl: MANAGED,
      path: 'canonical/cid/cid.webp',
      uploaded: true,
      mimeType: 'image/webp',
      cid: 'cid',
    });
    applyDisplayImagePathToToken.mockResolvedValue('applied');

    const result = await ensurePumpTokenDisplayImage({
      db: {} as never,
      mint: MINT,
      imageUri: 'ipfs://bafkreiffc2vh75vzbn6e6lngg4m6jijhmqev426237fhjzcrjxfwfyqmvu',
    });

    expect(result).toEqual({
      ok: true,
      displayImageUrl: MANAGED,
      status: 'applied',
    });
    expect(applyDisplayImagePathToToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chainId: 900001,
        tokenAddress: MINT,
        displayImageUrl: MANAGED,
      }),
    );
  });

  it('returns falsey reason when image uri missing', async () => {
    const result = await ensurePumpTokenDisplayImage({
      db: {} as never,
      mint: MINT,
      imageUri: null,
    });
    expect(result).toEqual({ ok: false, reason: 'missing_image_uri' });
  });
});
