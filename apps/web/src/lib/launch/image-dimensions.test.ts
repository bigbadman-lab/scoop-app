import { describe, expect, it } from 'vitest';
import {
  assertSquareRasterImageBytes,
  readRasterImageDimensions,
  squareDimensionError,
  TOKEN_IMAGE_SQUARE_ERROR,
} from '@/lib/launch/image-dimensions';

/** Deterministic tiny fixtures (generated offline; not production assets). */
const FIXTURES = {
  squarePng: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4oaGBFTEMLQkAgl1GAXRgBQ4AAAAASUVORK5CYII=',
    'base64',
  ),
  landscapePng: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWM4oaFBEmIY1aAxGEIJAAxxnYHF8mvxAAAAAElFTkSuQmCC',
    'base64',
  ),
  portraitPng: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAkAAAAQCAIAAABLKsIUAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFUlEQVQYlWM4oaGBCzGMyp0Y7OECADPWnYHPeEwoAAAAAElFTkSuQmCC',
    'base64',
  ),
  squareJpeg: Buffer.from(
    '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKAAK2/9k=',
    'base64',
  ),
  landscapeJpeg: Buffer.from(
    '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAJABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCKAAK2/9k=',
    'base64',
  ),
  squareWebp: Buffer.from(
    'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoIAAgAAUAmJaACdLoAA5gA/vCbQ/4DdfFtMv/ucD/uyf/2yf+pAAAA',
    'base64',
  ),
  landscapeWebp: Buffer.from(
    'UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoQAAkAAUAmJaACdLoAA5gA/vCbQ/4DdfFtMv/ucD/uyf/2yf+pAAAA',
    'base64',
  ),
} as const;

describe('readRasterImageDimensions', () => {
  it('reads square PNG/JPEG/WebP', () => {
    expect(readRasterImageDimensions(FIXTURES.squarePng)).toEqual({
      width: 8,
      height: 8,
    });
    expect(readRasterImageDimensions(FIXTURES.squareJpeg)).toEqual({
      width: 8,
      height: 8,
    });
    expect(readRasterImageDimensions(FIXTURES.squareWebp)).toEqual({
      width: 8,
      height: 8,
    });
  });

  it('reads landscape and portrait PNG', () => {
    expect(readRasterImageDimensions(FIXTURES.landscapePng)).toEqual({
      width: 16,
      height: 9,
    });
    expect(readRasterImageDimensions(FIXTURES.portraitPng)).toEqual({
      width: 9,
      height: 16,
    });
  });

  it('rejects non-image bytes', () => {
    expect(() =>
      readRasterImageDimensions(Buffer.from('not-an-image-file!!!!')),
    ).toThrow();
  });
});

describe('assertSquareRasterImageBytes (server gate)', () => {
  it('accepts square valid images', () => {
    expect(() => assertSquareRasterImageBytes(FIXTURES.squarePng)).not.toThrow();
    expect(() => assertSquareRasterImageBytes(FIXTURES.squareJpeg)).not.toThrow();
    expect(() => assertSquareRasterImageBytes(FIXTURES.squareWebp)).not.toThrow();
  });

  it('rejects landscape and portrait before pin', () => {
    expect(() => assertSquareRasterImageBytes(FIXTURES.landscapePng)).toThrow(
      TOKEN_IMAGE_SQUARE_ERROR,
    );
    expect(() => assertSquareRasterImageBytes(FIXTURES.portraitPng)).toThrow(
      TOKEN_IMAGE_SQUARE_ERROR,
    );
    expect(() => assertSquareRasterImageBytes(FIXTURES.landscapeJpeg)).toThrow(
      TOKEN_IMAGE_SQUARE_ERROR,
    );
    expect(() => assertSquareRasterImageBytes(FIXTURES.landscapeWebp)).toThrow(
      TOKEN_IMAGE_SQUARE_ERROR,
    );
  });

  it('does not trust client-supplied dimensions (bytes only)', () => {
    // Client could claim 1024×1024; server reads landscape bytes and rejects.
    const clientClaimed = { width: 1024, height: 1024 };
    expect(squareDimensionError(clientClaimed.width, clientClaimed.height)).toBeNull();
    expect(() => assertSquareRasterImageBytes(FIXTURES.landscapePng)).toThrow(
      TOKEN_IMAGE_SQUARE_ERROR,
    );
  });
});
