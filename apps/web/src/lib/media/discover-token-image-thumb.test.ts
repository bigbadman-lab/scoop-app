import { describe, expect, it } from 'vitest';
import {
  DISCOVER_TOKEN_IMAGE_THUMB,
  toDiscoverTokenImageThumb,
} from '@/lib/media/discover-token-image-thumb';

describe('toDiscoverTokenImageThumb', () => {
  it('rewrites public token-image object URLs to square render thumbs', () => {
    const input =
      'https://example.supabase.co/storage/v1/object/public/token-image/drafts/a/b/image.png';
    const out = toDiscoverTokenImageThumb(input);
    expect(out).toBe(
      'https://example.supabase.co/storage/v1/render/image/public/token-image/drafts/a/b/image.png?width=640&height=640&quality=70',
    );

    const url = new URL(out!);
    expect(url.pathname).toBe(
      '/storage/v1/render/image/public/token-image/drafts/a/b/image.png',
    );
    expect(url.searchParams.get('width')).toBe(
      String(DISCOVER_TOKEN_IMAGE_THUMB.width),
    );
    expect(url.searchParams.get('height')).toBe(
      String(DISCOVER_TOKEN_IMAGE_THUMB.height),
    );
    expect(url.searchParams.get('quality')).toBe(
      String(DISCOVER_TOKEN_IMAGE_THUMB.quality),
    );
  });

  it('preserves nested object paths', () => {
    const input =
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/drafts/5db06277-c35e-418d-8763-d6e14fb47b38/489d14a0-6ced-4b77-84b9-19b8cca475e0/e7bac7f7bb656c92.png';
    const out = toDiscoverTokenImageThumb(input);
    expect(out).toBe(
      'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/render/image/public/token-image/drafts/5db06277-c35e-418d-8763-d6e14fb47b38/489d14a0-6ced-4b77-84b9-19b8cca475e0/e7bac7f7bb656c92.png?width=640&height=640&quality=70',
    );
  });

  it('preserves manual/ paths', () => {
    const input =
      'https://proj.supabase.co/storage/v1/object/public/token-image/manual/aa3ca5ea27fecb3e/aa3ca5ea27fecb3e.png';
    expect(toDiscoverTokenImageThumb(input)).toBe(
      'https://proj.supabase.co/storage/v1/render/image/public/token-image/manual/aa3ca5ea27fecb3e/aa3ca5ea27fecb3e.png?width=640&height=640&quality=70',
    );
  });

  it('passes through IPFS gateway URLs', () => {
    const input =
      'https://ipfs.io/ipfs/bafybeieb2j2uutp5cyno542naaqjvv5tiynw6szc3nb47nopdq3bpi4pn4';
    expect(toDiscoverTokenImageThumb(input)).toBe(input);
  });

  it('passes through arbitrary HTTPS images', () => {
    const input = 'https://cdn.example.com/art.png';
    expect(toDiscoverTokenImageThumb(input)).toBe(input);
  });

  it('passes through local paths', () => {
    expect(toDiscoverTokenImageThumb('/image.png')).toBe('/image.png');
  });

  it('passes through malformed strings and null', () => {
    expect(toDiscoverTokenImageThumb('not a url')).toBe('not a url');
    expect(toDiscoverTokenImageThumb(null)).toBeNull();
    expect(toDiscoverTokenImageThumb(undefined)).toBeNull();
  });

  it('passes through other Supabase buckets', () => {
    const input =
      'https://example.supabase.co/storage/v1/object/public/profile-avatars/u/avatar.png';
    expect(toDiscoverTokenImageThumb(input)).toBe(input);
  });

  it('passes through URLs already using render/image', () => {
    const input =
      'https://example.supabase.co/storage/v1/render/image/public/token-image/drafts/a/b/image.png?width=320&quality=80';
    expect(toDiscoverTokenImageThumb(input)).toBe(input);
  });

  it('does not transform non-https supabase URLs', () => {
    const input =
      'http://example.supabase.co/storage/v1/object/public/token-image/x.png';
    expect(toDiscoverTokenImageThumb(input)).toBe(input);
  });
});
