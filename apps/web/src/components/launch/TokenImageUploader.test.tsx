import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenImageUploader } from '@/components/launch/TokenImageUploader';
import type { TokenImageState } from '@/lib/launch/types';

const emptyImage: TokenImageState = {
  previewUrl: null,
  fileName: null,
  mimeType: null,
  byteSize: null,
  persistence: 'local_only',
  ipfsUri: null,
  displayImagePath: null,
  source: 'user',
  artworkStatus: 'ready',
  artworkError: null,
  artworkAssetId: null,
};

describe('TokenImageUploader copy', () => {
  it('advertises square (1:1) and max 5MB', () => {
    render(
      <TokenImageUploader
        image={emptyImage}
        onChange={() => undefined}
        onClear={() => undefined}
      />,
    );
    const copy = screen.getByText(/PNG · JPEG · WebP/i).textContent ?? '';
    expect(copy).toMatch(/square \(1:1\)/i);
    expect(copy).toMatch(/max 5MB/i);
  });
});
