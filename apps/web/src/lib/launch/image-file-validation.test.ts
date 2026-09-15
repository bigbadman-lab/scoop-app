import { describe, expect, it, vi } from 'vitest';
import {
  TOKEN_IMAGE_SQUARE_ERROR,
  validateImageFile,
  validateImageFileAsync,
} from '@/lib/launch/validation';
import { META_LIMITS } from '@/lib/launch/types';

const SQUARE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4oaGBFTEMLQkAgl1GAXRgBQ4AAAAASUVORK5CYII=',
  'base64',
);
const LANDSCAPE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWM4oaFBEmIY1aAxGEIJAAxxnYHF8mvxAAAAAElFTkSuQmCC',
  'base64',
);
const PORTRAIT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAQCAIAAABLKsIUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWM4oaGBCzGMyp0Y7OECADPWnYHPeEwoAAAAAElFTkSuQmCC',
  'base64',
);
const SQUARE_JPEG = Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKAAK2/9k=',
  'base64',
);
const SQUARE_WEBP = Buffer.from(
  'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoIAAgAAUAmJaACdLoAA5gA/vCbQ/4DdfFtMv/ucD/uyf/2yf+pAAAA',
  'base64',
);

function fileFrom(bytes: Buffer, name: string, type: string): File {
  return new File([bytes], name, { type });
}

describe('validateImageFileAsync (client 1:1)', () => {
  it('accepts square PNG/JPEG/WebP within size limit', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => {
        // Mirror server header probe for deterministic jsdom tests
        const { readRasterImageDimensions } = await import(
          '@/lib/launch/image-dimensions'
        );
        const buf = new Uint8Array(await blob.arrayBuffer());
        const dims = readRasterImageDimensions(buf);
        return {
          width: dims.width,
          height: dims.height,
          close: vi.fn(),
        };
      }),
    );

    expect(
      await validateImageFileAsync(fileFrom(SQUARE_PNG, 'a.png', 'image/png')),
    ).toBeNull();
    expect(
      await validateImageFileAsync(fileFrom(SQUARE_JPEG, 'a.jpg', 'image/jpeg')),
    ).toBeNull();
    expect(
      await validateImageFileAsync(fileFrom(SQUARE_WEBP, 'a.webp', 'image/webp')),
    ).toBeNull();
  });

  it('rejects landscape and portrait with square error', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async (blob: Blob) => {
        const { readRasterImageDimensions } = await import(
          '@/lib/launch/image-dimensions'
        );
        const buf = new Uint8Array(await blob.arrayBuffer());
        const dims = readRasterImageDimensions(buf);
        return { width: dims.width, height: dims.height, close: vi.fn() };
      }),
    );

    expect(
      await validateImageFileAsync(
        fileFrom(LANDSCAPE_PNG, 'wide.png', 'image/png'),
      ),
    ).toBe(TOKEN_IMAGE_SQUARE_ERROR);
    expect(
      await validateImageFileAsync(
        fileFrom(PORTRAIT_PNG, 'tall.png', 'image/png'),
      ),
    ).toBe(TOKEN_IMAGE_SQUARE_ERROR);
  });

  it('keeps existing MIME and size rejection', async () => {
    expect(validateImageFile(new File(['x'], 'a.gif', { type: 'image/gif' }))).toMatch(
      /png/i,
    );
    expect(
      await validateImageFileAsync(new File(['x'], 'a.gif', { type: 'image/gif' })),
    ).toMatch(/png/i);

    const oversize = new File(
      [new Uint8Array(META_LIMITS.imageFileMaxBytes + 1)],
      'big.png',
      { type: 'image/png' },
    );
    expect(validateImageFile(oversize)).toMatch(/5MB/i);
    expect(await validateImageFileAsync(oversize)).toMatch(/5MB/i);
  });
});
