import { describe, expect, it, vi } from 'vitest';
import { createPinataArtworkPinner, isPinataConfigured } from '@/lib/launch/ipfs-pinata';
import { ensureArtworkPinned } from '@/lib/launch/ensure-ipfs';
import { IpfsPinNotConfiguredError } from '@/lib/launch/ipfs';
import { createInitialLaunchState } from '@/lib/launch/types';

const CID = 'bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';
const IPFS = `ipfs://${CID}`;

describe('Pinata pinner', () => {
  it('detects configuration', () => {
    expect(isPinataConfigured({ PINATA_JWT: '' })).toBe(false);
    expect(isPinataConfigured({ PINATA_JWT: 'jwt' })).toBe(true);
  });

  it('pins once and returns valid ipfs:// URI', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ IpfsHash: CID }, { status: 200 }),
    ) as unknown as typeof fetch;
    const pinner = createPinataArtworkPinner({ PINATA_JWT: 'test-jwt' }, fetchImpl);
    const result = await pinner.pinArtwork({
      bytes: new Uint8Array([1, 2, 3, 4]),
      mimeType: 'image/png',
      fileName: 'a.png',
    });
    expect(result.ipfsUri).toBe(IPFS);
    expect(result.cid).toBe(CID);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed provider CID', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ IpfsHash: '!!!' }, { status: 200 }),
    ) as unknown as typeof fetch;
    const pinner = createPinataArtworkPinner({ PINATA_JWT: 'test-jwt' }, fetchImpl);
    await expect(
      pinner.pinArtwork({
        bytes: new Uint8Array([1]),
        mimeType: 'image/png',
      }),
    ).rejects.toThrow(/invalid CID/i);
  });

  it('requires JWT', () => {
    expect(() => createPinataArtworkPinner({ PINATA_JWT: '' })).toThrow(
      IpfsPinNotConfiguredError,
    );
  });
});

describe('ensureArtworkPinned', () => {
  it('reuses existing ipfsUri without calling pin API', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const image = createInitialLaunchState().image;
    image.ipfsUri = IPFS;
    image.persistence = 'ipfs_ready';
    image.previewUrl = 'blob:x';
    const result = await ensureArtworkPinned({ image, fetchImpl });
    expect(result.reused).toBe(true);
    expect(result.ipfsUri).toBe(IPFS);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('pins when ipfsUri missing', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('blob:') || url.includes('preview')) {
        return new Response(new Uint8Array([9, 9, 9]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      }
      return Response.json({ ok: true, ipfsUri: IPFS, cid: CID }, { status: 200 });
    }) as unknown as typeof fetch;

    const image = createInitialLaunchState().image;
    image.previewUrl = 'blob:preview';
    image.mimeType = 'image/png';
    image.source = 'user';
    image.artworkStatus = 'ready';

    const result = await ensureArtworkPinned({ image, fetchImpl });
    expect(result.reused).toBe(false);
    expect(result.ipfsUri).toBe(IPFS);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('failed pin blocks launch prep', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('blob:')) {
        return new Response(new Uint8Array([1]), { status: 200 });
      }
      return Response.json({ ok: false, error: 'pin down' }, { status: 503 });
    }) as unknown as typeof fetch;
    const image = createInitialLaunchState().image;
    image.previewUrl = 'blob:x';
    image.mimeType = 'image/png';
    await expect(ensureArtworkPinned({ image, fetchImpl })).rejects.toThrow(/pin/i);
  });

  it('manual selected image is the pin source (previewUrl)', async () => {
    // Late AI must not change previewUrl when source=user (LaunchFlow invariant).
    const image = createInitialLaunchState().image;
    image.source = 'user';
    image.previewUrl = 'blob:manual';
    image.mimeType = 'image/png';
    image.ipfsUri = null;

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'blob:manual') {
        return new Response(new Uint8Array([7, 7]), { status: 200 });
      }
      if (url.includes('/api/launch/artwork/pin')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          bytesBase64?: string;
          persistDisplayCopy?: boolean;
        };
        expect(body.bytesBase64).toBeTruthy();
        expect(body.persistDisplayCopy).toBe(true);
        return Response.json({
          ok: true,
          ipfsUri: IPFS,
          cid: CID,
          displayImagePath: 'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await ensureArtworkPinned({ image, fetchImpl });
    expect(result.ipfsUri).toBe(IPFS);
    expect(result.displayImagePath).toBe(
      'manual/aaaaaaaaaaaaaaaa/aaaaaaaaaaaaaaaa.png',
    );
  });

  it('AI pin does not request display copy (draft path owns display)', async () => {
    const image = createInitialLaunchState().image;
    image.source = 'ai';
    image.previewUrl = 'blob:ai';
    image.mimeType = 'image/png';

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'blob:ai') {
        return new Response(new Uint8Array([1]), { status: 200 });
      }
      if (url.includes('/api/launch/artwork/pin')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          persistDisplayCopy?: boolean;
        };
        expect(body.persistDisplayCopy).toBe(false);
        return Response.json({ ok: true, ipfsUri: IPFS, cid: CID });
      }
      throw new Error(`unexpected fetch ${url}`);
    }) as unknown as typeof fetch;

    const result = await ensureArtworkPinned({ image, fetchImpl });
    expect(result.displayImagePath ?? null).toBeNull();
  });
});
