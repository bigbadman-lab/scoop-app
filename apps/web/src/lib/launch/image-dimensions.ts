/**
 * Decode PNG / JPEG / WebP pixel dimensions from encoded bytes (header probe).
 * Used for server-authoritative 1:1 enforcement before pin — no crop/resize.
 */

export const TOKEN_IMAGE_SQUARE_ERROR = 'Image must be square (1:1).';
export const TOKEN_IMAGE_DIMENSIONS_UNREADABLE_ERROR =
  'Could not read image dimensions.';

export type ImageDimensions = { width: number; height: number };

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function u16be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 8) | bytes[offset + 1]!) >>> 0;
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += String.fromCharCode(bytes[offset + i]!);
  return out;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 24) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

function isJpeg(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  for (let i = 0; i < JPEG_MAGIC.length; i++) {
    if (bytes[i] !== JPEG_MAGIC[i]) return false;
  }
  return true;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 16 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  );
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions {
  // IHDR: length(4) + type(4) + width(4) + height(4) immediately after signature
  if (ascii(bytes, 12, 4) !== 'IHDR') {
    throw new Error('INVALID_PNG');
  }
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  if (width < 1 || height < 1) throw new Error('INVALID_PNG_SIZE');
  return { width, height };
}

/** SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15 (skip DHT/DAC/etc.). */
function isJpegSofMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readJpegDimensions(bytes: Uint8Array): ImageDimensions {
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) break;
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break; // EOI / SOS
    if (offset + 2 > bytes.byteLength) break;
    const segLen = u16be(bytes, offset);
    if (segLen < 2) throw new Error('INVALID_JPEG');
    if (isJpegSofMarker(marker)) {
      if (offset + 7 > bytes.byteLength) throw new Error('INVALID_JPEG');
      const height = u16be(bytes, offset + 3);
      const width = u16be(bytes, offset + 5);
      if (width < 1 || height < 1) throw new Error('INVALID_JPEG_SIZE');
      return { width, height };
    }
    offset += segLen;
  }
  throw new Error('JPEG_SOF_MISSING');
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions {
  // Chunk at offset 12: FourCC (4) + size (4 LE) + payload
  if (bytes.byteLength < 30) throw new Error('INVALID_WEBP');
  const fourcc = ascii(bytes, 12, 4);

  if (fourcc === 'VP8X') {
    // Canvas width/height minus one, 24-bit little-endian at payload+8
    const width = u24le(bytes, 24) + 1;
    const height = u24le(bytes, 27) + 1;
    if (width < 1 || height < 1) throw new Error('INVALID_WEBP_SIZE');
    return { width, height };
  }

  if (fourcc === 'VP8L') {
    // Lossless: signature 0x2f, then 14-bit width-1 and height-1
    if (bytes.byteLength < 25 || bytes[20] !== 0x2f) {
      throw new Error('INVALID_WEBP_L');
    }
    const b0 = bytes[21]!;
    const b1 = bytes[22]!;
    const b2 = bytes[23]!;
    const b3 = bytes[24]!;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height =
      1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    if (width < 1 || height < 1) throw new Error('INVALID_WEBP_SIZE');
    return { width, height };
  }

  if (fourcc === 'VP8 ') {
    // Lossy keyframe: chunk size (4 LE) + frame tag (3) + start code (3)
    // then 14-bit width / height little-endian
    if (bytes.byteLength < 30) throw new Error('INVALID_WEBP_VP8');
    const w = bytes[26]! | ((bytes[27]! & 0x3f) << 8);
    const h = bytes[28]! | ((bytes[29]! & 0x3f) << 8);
    if (w < 1 || h < 1) throw new Error('INVALID_WEBP_SIZE');
    return { width: w, height: h };
  }

  throw new Error('UNSUPPORTED_WEBP');
}

/**
 * Read decoded pixel dimensions from PNG, JPEG, or WebP bytes.
 * Throws if the payload is not a recognized raster header.
 */
export function readRasterImageDimensions(bytes: Uint8Array): ImageDimensions {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 24) {
    throw new Error('IMAGE_TOO_SMALL');
  }
  if (isPng(bytes)) return readPngDimensions(bytes);
  if (isJpeg(bytes)) return readJpegDimensions(bytes);
  if (isWebp(bytes)) return readWebpDimensions(bytes);
  throw new Error('UNSUPPORTED_IMAGE');
}

export function squareDimensionError(
  width: number,
  height: number,
): string | null {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    return TOKEN_IMAGE_DIMENSIONS_UNREADABLE_ERROR;
  }
  if (width !== height) return TOKEN_IMAGE_SQUARE_ERROR;
  return null;
}

/**
 * Server gate: reject non-square or undecodable raster bytes.
 * Does not trust any client-supplied width/height.
 */
export function assertSquareRasterImageBytes(bytes: Uint8Array): void {
  const { width, height } = readRasterImageDimensions(bytes);
  const error = squareDimensionError(width, height);
  if (error) {
    throw new Error(error);
  }
}

/**
 * Browser: decode via createImageBitmap / HTMLImageElement (actual pixels).
 */
export async function readImageFileDimensions(
  file: File,
): Promise<ImageDimensions> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const dims = await new Promise<ImageDimensions>((resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
      img.src = url;
    });
    return dims;
  } finally {
    URL.revokeObjectURL(url);
  }
}
