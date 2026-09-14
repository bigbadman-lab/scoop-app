import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildCanonicalTokenDisplayImagePath,
  buildManualTokenDisplayImagePath,
  buildTokenDisplayImagePath,
  deriveTokenImagePublicUrl,
  isAllowedTokenDisplayImagePath,
  parseIpfsCid,
  TOKEN_IMAGE_BUCKET,
  validateTokenDisplayImage,
} from './token-image-storage.js';
import { persistSelectedArtworkDisplayCopy } from './display-copy.js';
import { mirrorIpfsUriToTokenImage } from './mirror-ipfs-display.js';

describe('token-image display path', () => {
  it('builds content-addressed draft object path', () => {
    const bytes = Buffer.from('hello-image');
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const draftId = '11111111-1111-4111-8111-111111111111';
    const artworkId = '22222222-2222-4222-8222-222222222222';
    expect(
      buildTokenDisplayImagePath({
        draftId,
        artworkId,
        bytes,
        mimeType: 'image/png',
      }),
    ).toBe(`drafts/${draftId}/${artworkId}/${hash}.png`);
  });

  it('builds content-addressed manual path', () => {
    const bytes = Buffer.from('manual-bytes');
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    expect(
      buildManualTokenDisplayImagePath({ bytes, mimeType: 'image/png' }),
    ).toBe(`manual/${hash}/${hash}.png`);
  });

  it('allowlists drafts/, manual/, and canonical/ object paths', () => {
    expect(
      isAllowedTokenDisplayImagePath(
        'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
      ),
    ).toBe(true);
    expect(
      isAllowedTokenDisplayImagePath(
        'drafts/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/aaaaaaaaaaaaaaaa.png',
      ),
    ).toBe(true);
    expect(
      isAllowedTokenDisplayImagePath(
        'canonical/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi.png',
      ),
    ).toBe(true);
    expect(isAllowedTokenDisplayImagePath('../etc/passwd')).toBe(false);
    expect(isAllowedTokenDisplayImagePath('https://evil.example/x.png')).toBe(
      false,
    );
  });

  it('same bytes → same path; different bytes → different path', () => {
    const draftId = '11111111-1111-4111-8111-111111111111';
    const artworkId = '22222222-2222-4222-8222-222222222222';
    const a = buildTokenDisplayImagePath({
      draftId,
      artworkId,
      bytes: Buffer.from('a'),
      mimeType: 'image/png',
    });
    const b = buildTokenDisplayImagePath({
      draftId,
      artworkId,
      bytes: Buffer.from('a'),
      mimeType: 'image/png',
    });
    const c = buildTokenDisplayImagePath({
      draftId,
      artworkId,
      bytes: Buffer.from('b'),
      mimeType: 'image/png',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('derives public URL from known origin + path only', () => {
    expect(
      deriveTokenImagePublicUrl(
        'https://hmqfzilijidiqtignamz.supabase.co',
        'helloworld.png',
      ),
    ).toBe(
      `https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/${TOKEN_IMAGE_BUCKET}/helloworld.png`,
    );
  });

  it('rejects invalid mime and empty/oversized payloads', () => {
    expect(() =>
      validateTokenDisplayImage({ bytes: Buffer.from('x'), mimeType: 'text/plain' }),
    ).toThrow(/UNSUPPORTED_MIME/);
    expect(() =>
      validateTokenDisplayImage({ bytes: Buffer.alloc(0), mimeType: 'image/png' }),
    ).toThrow(/INVALID_SIZE/);
  });
});

describe('persistSelectedArtworkDisplayCopy', () => {
  it('uploads display copy and stores URL on artwork row', async () => {
    const db = {
      query: vi.fn(async () => ({ rows: [] })),
    };
    const bytes = Buffer.from('png-bytes');
    const draftStorage = {
      uploadArtwork: vi.fn(),
      downloadArtwork: vi.fn(async () => bytes),
      createSignedPreviewUrl: vi.fn(),
    };
    const tokenImageStorage = {
      uploadDisplayCopy: vi.fn(async ({ path }: { path: string }) => ({
        path,
        publicUrl: `https://proj.supabase.co/storage/v1/object/public/token-image/${path}`,
      })),
      publicUrlForPath: (path: string) =>
        `https://proj.supabase.co/storage/v1/object/public/token-image/${path}`,
    };

    const result = await persistSelectedArtworkDisplayCopy({
      db: db as never,
      draftId: '11111111-1111-4111-8111-111111111111',
      artworkId: '22222222-2222-4222-8222-222222222222',
      draftStoragePath: 'news/x/y/art_1.png',
      mimeType: 'image/png',
      draftStorage,
      tokenImageStorage,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.publicUrl).toContain('/token-image/drafts/');
      expect(result.publicUrl).toContain('https://');
    }
    expect(tokenImageStorage.uploadDisplayCopy).toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('display_image_path'),
      expect.any(Array),
    );
  });

  it('returns ok:false when upload fails without throwing', async () => {
    const result = await persistSelectedArtworkDisplayCopy({
      db: { query: vi.fn() } as never,
      draftId: '11111111-1111-4111-8111-111111111111',
      artworkId: '22222222-2222-4222-8222-222222222222',
      draftStoragePath: 'news/x/y/art_1.png',
      mimeType: 'image/png',
      draftStorage: {
        uploadArtwork: vi.fn(),
        downloadArtwork: vi.fn(async () => Buffer.from('x')),
        createSignedPreviewUrl: vi.fn(),
      },
      tokenImageStorage: {
        uploadDisplayCopy: vi.fn(async () => {
          throw new Error('boom');
        }),
        publicUrlForPath: () => '',
      },
      log: () => undefined,
    });
    expect(result).toEqual({ ok: false, reason: 'boom' });
  });
});

describe('canonical IPFS display path + mirror', () => {
  it('parses ipfs CID and builds canonical path', () => {
    expect(parseIpfsCid('ipfs://bafybeiabc/foo.png')).toBe('bafybeiabc');
    expect(parseIpfsCid('https://ipfs.io/ipfs/x')).toBeNull();
    const path = buildCanonicalTokenDisplayImagePath({
      cid: 'bafybeiabc',
      mimeType: 'image/png',
    });
    expect(path).toBe('canonical/bafybeiabc/bafybeiabc.png');
  });

  it('mirrors IPFS bytes into token-image once', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const storage = {
      uploadDisplayCopy: vi.fn(async ({ path }: { path: string }) => ({
        path,
        publicUrl: `https://proj.supabase.co/storage/v1/object/public/token-image/${path}`,
      })),
      publicUrlForPath: (path: string) =>
        `https://proj.supabase.co/storage/v1/object/public/token-image/${path}`,
    };
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      return new Response(png, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    }) as unknown as typeof fetch;

    const first = await mirrorIpfsUriToTokenImage({
      imageUri: 'ipfs://bafybeimirror1',
      storage,
      fetchImpl,
    });
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.uploaded).toBe(true);
      expect(first.path).toContain('canonical/bafybeimirror1');
    }

    const fetchReuse = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } });
    }) as unknown as typeof fetch;
    const second = await mirrorIpfsUriToTokenImage({
      imageUri: 'ipfs://bafybeimirror1',
      storage,
      fetchImpl: fetchReuse,
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.uploaded).toBe(false);
    expect(storage.uploadDisplayCopy).toHaveBeenCalledTimes(1);
  });
});
