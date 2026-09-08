import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenImage } from '@/components/ui/TokenImage';
import {
  SCOOP_IPFS_GATEWAY_PREFIX,
  pickTokenImageSrc,
  resolveTokenImageSrc,
} from '@/lib/media/resolve-token-image';
import { HELLO_FIXTURE } from '@scoop/shared';

const HELLO_IPFS = HELLO_FIXTURE.metadata.imageUri;

describe('resolveTokenImageSrc', () => {
  it('resolves HELLO-like ipfs://CID to canonical gateway HTTPS', () => {
    expect(HELLO_IPFS.startsWith('ipfs://')).toBe(true);
    expect(resolveTokenImageSrc(HELLO_IPFS)).toBe(
      `${SCOOP_IPFS_GATEWAY_PREFIX}/bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi`,
    );
  });

  it('resolves nested ipfs://CID/path', () => {
    expect(resolveTokenImageSrc('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/token.png')).toBe(
      `${SCOOP_IPFS_GATEWAY_PREFIX}/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/token.png`,
    );
  });

  it('tolerates ipfs://ipfs/CID double prefix', () => {
    expect(resolveTokenImageSrc('ipfs://ipfs/bafybeiabc')).toBe(
      `${SCOOP_IPFS_GATEWAY_PREFIX}/bafybeiabc`,
    );
  });

  it('passes through https and http safely', () => {
    expect(resolveTokenImageSrc('https://cdn.example/token.png')).toBe(
      'https://cdn.example/token.png',
    );
    expect(resolveTokenImageSrc('http://localhost:3000/local.png')).toBe(
      'http://localhost:3000/local.png',
    );
  });

  it('returns null for missing and unsafe schemes', () => {
    expect(resolveTokenImageSrc(null)).toBeNull();
    expect(resolveTokenImageSrc('')).toBeNull();
    expect(resolveTokenImageSrc('   ')).toBeNull();
    expect(resolveTokenImageSrc('javascript:alert(1)')).toBeNull();
    expect(resolveTokenImageSrc('data:image/png;base64,aaa')).toBeNull();
    expect(resolveTokenImageSrc('file:///etc/passwd')).toBeNull();
    expect(resolveTokenImageSrc('ftp://files.example/a.png')).toBeNull();
  });
});

describe('pickTokenImageSrc', () => {
  const HELLO_DISPLAY =
    'https://hmqfzilijidiqtignamz.supabase.co/storage/v1/object/public/token-image/helloworld.png';

  it('prefers displayImageUrl over IPFS imageUri', () => {
    expect(pickTokenImageSrc(HELLO_DISPLAY, HELLO_IPFS)).toBe(HELLO_DISPLAY);
  });

  it('falls back to IPFS when display URL missing', () => {
    expect(pickTokenImageSrc(null, HELLO_IPFS)).toBe(
      `${SCOOP_IPFS_GATEWAY_PREFIX}/bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi`,
    );
  });

  it('returns null when both missing', () => {
    expect(pickTokenImageSrc(null, null)).toBeNull();
    expect(pickTokenImageSrc('', '')).toBeNull();
  });
});

describe('TokenImage', () => {
  it('renders resolved HELLO IPFS image, not fallback', () => {
    render(<TokenImage src={HELLO_IPFS} alt="Hello World" size={320} />);
    const img = screen.getByRole('img', { name: /hello world/i });
    expect(img.getAttribute('src')).toBe(
      `${SCOOP_IPFS_GATEWAY_PREFIX}/bafybeihzgw4e5bppt5wu2eqrm524xdme6g73rzdoifo5hujjavnm7exwyi`,
    );
    expect(img.getAttribute('src')?.startsWith('https://')).toBe(true);
    expect(img.getAttribute('src')?.startsWith('ipfs://')).toBe(false);
    expect(screen.queryByText(/scoop/i)).toBeNull();
  });

  it('uses branded fallback when image missing', () => {
    render(<TokenImage src="" alt="Missing" />);
    expect(screen.getByRole('img', { name: /missing/i })).toBeTruthy();
    expect(screen.getByText(/scoop/i)).toBeTruthy();
  });

  it('uses fallback for invalid schemes', () => {
    render(<TokenImage src="javascript:void(0)" alt="Bad" />);
    expect(screen.getByText(/scoop/i)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /^bad$/i })).toBeTruthy(); // fallback role=img
  });
});
