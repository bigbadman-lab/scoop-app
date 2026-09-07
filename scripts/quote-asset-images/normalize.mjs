import { PNG } from 'pngjs';
import { decode as decodeJpeg } from 'jpeg-js';
import { Resvg } from '@resvg/resvg-js';
import { assertImageBytes, readPngDimensions, sha256Hex } from './validate.mjs';

export const OUTPUT_SIZE = 512;

/**
 * Decode PNG bytes to RGBA bitmap via pngjs.
 * @param {Buffer} pngBytes
 */
export function decodePng(pngBytes) {
  assertImageBytes(pngBytes, 'image/png');
  const png = PNG.sync.read(pngBytes);
  return { width: png.width, height: png.height, data: png.data };
}

/**
 * @param {Buffer} jpegBytes
 */
export function decodeJpegToRgba(jpegBytes) {
  const decoded = decodeJpeg(jpegBytes, { useTArray: true });
  // jpeg-js returns RGB or RGBA depending on version; normalize to RGBA
  const { width, height } = decoded;
  const src = Buffer.from(decoded.data);
  if (src.length === width * height * 4) {
    return { width, height, data: src };
  }
  if (src.length !== width * height * 3) {
    throw new Error('Unexpected JPEG decode buffer size');
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += 3) {
    const o = i * 4;
    rgba[o] = src[j];
    rgba[o + 1] = src[j + 1];
    rgba[o + 2] = src[j + 2];
    rgba[o + 3] = 255;
  }
  return { width, height, data: rgba };
}

/**
 * Rasterize SVG to RGBA via resvg (fit inside target box, preserve aspect).
 * @param {Buffer} svgBytes
 * @param {number} [fit]
 */
export function decodeSvgToRgba(svgBytes, fit = OUTPUT_SIZE) {
  const resvg = new Resvg(svgBytes, {
    fitTo: { mode: 'inside', value: fit },
    background: 'rgba(0,0,0,0)',
  });
  const pngData = resvg.render();
  const pngBytes = Buffer.from(pngData.asPng());
  return decodePng(pngBytes);
}

/**
 * Nearest-neighbor scale preserving aspect ratio onto a transparent square canvas.
 * No color changes, no branding, no stretch.
 * @param {{ width: number, height: number, data: Buffer }} src
 * @param {number} [size]
 */
export function fitToSquareRgba(src, size = OUTPUT_SIZE) {
  if (!src.width || !src.height) throw new Error('Invalid source dimensions');
  const scale = Math.min(size / src.width, size / src.height);
  const dw = Math.max(1, Math.round(src.width * scale));
  const dh = Math.max(1, Math.round(src.height * scale));
  const ox = Math.floor((size - dw) / 2);
  const oy = Math.floor((size - dh) / 2);

  const out = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      const si = (sy * src.width + sx) * 4;
      const di = ((oy + y) * size + (ox + x)) * 4;
      out[di] = src.data[si];
      out[di + 1] = src.data[si + 1];
      out[di + 2] = src.data[si + 2];
      out[di + 3] = src.data[si + 3];
    }
  }
  return { width: size, height: size, data: out, drawnWidth: dw, drawnHeight: dh };
}

/**
 * @param {{ width: number, height: number, data: Buffer }} rgba
 */
export function encodePng(rgba) {
  const png = new PNG({ width: rgba.width, height: rgba.height });
  rgba.data.copy(png.data);
  return PNG.sync.write(png);
}

/**
 * Normalize official source image bytes to production 512x512 PNG.
 * @param {Buffer} inputBytes
 * @param {string} [contentType]
 */
export function normalizeToSquarePng(inputBytes, contentType = 'image/png') {
  const detected = assertImageBytes(inputBytes, contentType);
  /** @type {{ width: number, height: number, data: Buffer }} */
  let decoded;
  let originalWidth;
  let originalHeight;

  if (detected.format === 'png') {
    const dims = readPngDimensions(inputBytes);
    originalWidth = dims.width;
    originalHeight = dims.height;
    decoded = decodePng(inputBytes);
  } else if (detected.format === 'jpeg') {
    decoded = decodeJpegToRgba(inputBytes);
    originalWidth = decoded.width;
    originalHeight = decoded.height;
  } else if (detected.format === 'svg') {
    decoded = decodeSvgToRgba(inputBytes, OUTPUT_SIZE);
    originalWidth = decoded.width;
    originalHeight = decoded.height;
  } else {
    throw new Error(`Normalization unsupported format: ${detected.format}`);
  }

  const fitted = fitToSquareRgba(decoded, OUTPUT_SIZE);
  const output = encodePng(fitted);
  return {
    originalMimeType: detected.mimeType,
    originalWidth,
    originalHeight,
    outputWidth: OUTPUT_SIZE,
    outputHeight: OUTPUT_SIZE,
    drawnWidth: fitted.drawnWidth,
    drawnHeight: fitted.drawnHeight,
    sha256: sha256Hex(output),
    bytes: output,
  };
}
