import { describe, expect, it } from 'vitest';
import {
  isSafeScoopWalletImageUrl,
  resolveScoopWalletImageSrc,
  scoopWalletMonogram,
} from '@/lib/auth/resolve-wallet-image';

describe('resolveScoopWalletImageSrc', () => {
  it('uses a valid https imageUrl', () => {
    expect(
      resolveScoopWalletImageSrc({
        name: 'MetaMask',
        imageUrl: 'https://cdn.example/mm.png',
        imageId: 'abc',
      }),
    ).toBe('https://cdn.example/mm.png');
  });

  it('rejects getAssetImage/undefined and missing art', () => {
    expect(
      resolveScoopWalletImageSrc({
        name: 'Broken',
        imageUrl: 'https://api.web3modal.com/public/getAssetImage/undefined',
      }),
    ).toBeNull();
    expect(
      resolveScoopWalletImageSrc({
        name: 'No art',
        imageId: undefined,
        imageUrl: '',
      }),
    ).toBeNull();
    expect(
      resolveScoopWalletImageSrc({
        name: 'Bad',
        imageUrl: 'undefined',
      }),
    ).toBeNull();
  });

  it('never invents a Reown asset URL from imageId alone', () => {
    expect(
      resolveScoopWalletImageSrc({
        name: 'Trust',
        imageId: 'some-id',
      }),
    ).toBeNull();
  });
});

describe('isSafeScoopWalletImageUrl', () => {
  it('allows https and data images', () => {
    expect(isSafeScoopWalletImageUrl('https://x/y.png')).toBe(true);
    expect(isSafeScoopWalletImageUrl('data:image/png;base64,aaa')).toBe(true);
  });
});

describe('scoopWalletMonogram', () => {
  it('builds a short monogram', () => {
    expect(scoopWalletMonogram('MetaMask')).toBe('ME');
    expect(scoopWalletMonogram('')).toBe('?');
  });
});
