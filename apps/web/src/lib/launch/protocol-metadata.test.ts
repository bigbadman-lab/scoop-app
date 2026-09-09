import { describe, expect, it } from 'vitest';
import {
  isProtocolIpfsImageUri,
  validateProtocolImageUri,
  validateProtocolMetadata,
  PROTOCOL_META,
} from '@/lib/launch/protocol-metadata';
import {
  assertIpfsUriForLaunch,
  createUnconfiguredIpfsPinner,
  IpfsPinNotConfiguredError,
} from '@/lib/launch/ipfs';

describe('protocol image URI', () => {
  it('accepts valid ipfs:// within byte limit', () => {
    const uri = 'ipfs://bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi';
    expect(validateProtocolImageUri(uri)).toBeNull();
    expect(isProtocolIpfsImageUri(uri)).toBe(true);
    expect(assertIpfsUriForLaunch(uri)).toBe(uri);
  });

  it('rejects local/blob/data/http URLs', () => {
    expect(validateProtocolImageUri('blob:https://x')).toMatch(/ipfs/i);
    expect(validateProtocolImageUri('data:image/png;base64,xx')).toMatch(/ipfs/i);
    expect(validateProtocolImageUri('https://cdn.example/a.png')).toMatch(/ipfs/i);
    expect(validateProtocolImageUri('/local/path.png')).toMatch(/ipfs/i);
  });

  it('enforces protocol byte limit', () => {
    const tooLong = `ipfs://${'a'.repeat(PROTOCOL_META.maxImageUriBytes)}`;
    expect(byteLen(tooLong)).toBeGreaterThan(PROTOCOL_META.maxImageUriBytes);
    expect(validateProtocolImageUri(tooLong)).toMatch(/bytes/i);
  });
});

describe('protocol metadata', () => {
  it('requires description and rejects twitter.com for launch', () => {
    const errors = validateProtocolMetadata({
      description: '',
      imageUri: 'ipfs://bafybeiabc',
      twitter: 'https://twitter.com/scoop',
    });
    expect(errors.description).toBeTruthy();
    expect(errors.twitter).toMatch(/x\.com/i);
  });
});

describe('IPFS pinner stub', () => {
  it('refuses pin until a provider is configured', async () => {
    const pinner = createUnconfiguredIpfsPinner();
    await expect(
      pinner.pinArtwork({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/png',
      }),
    ).rejects.toBeInstanceOf(IpfsPinNotConfiguredError);
  });
});

function byteLen(s: string) {
  return new TextEncoder().encode(s).length;
}
