import { createHash } from 'node:crypto';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const HTML_SNIFF = /^\s*</;

/**
 * @param {Buffer} bytes
 */
export function looksLikeSvg(bytes) {
  const head = bytes.subarray(0, Math.min(512, bytes.length)).toString('utf8');
  if (HTML_SNIFF.test(head) && /<!doctype html|<html/i.test(head)) return false;
  return (
    bytes.subarray(0, 5).toString('ascii') === '%SVG' ||
    /<svg[\s>]/i.test(head) ||
    (/<\?xml/i.test(head) && /<svg[\s>]/i.test(bytes.toString('utf8', 0, Math.min(4096, bytes.length))))
  );
}

/**
 * Reject HTML/error pages and non-image payloads.
 * Accepts PNG, JPEG, and SVG (SVG is rasterized downstream).
 * @param {Buffer} bytes
 * @param {string} [contentType]
 */
export function assertImageBytes(bytes, contentType = '') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24) {
    throw new Error('Invalid image: empty or too small');
  }
  const head = bytes.subarray(0, Math.min(64, bytes.length)).toString('utf8');
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/json')) {
    throw new Error(`Invalid image: unexpected content-type ${contentType}`);
  }
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    return { mimeType: 'image/png', format: 'png' };
  }
  if (bytes.subarray(0, 3).equals(JPEG_MAGIC)) {
    return { mimeType: 'image/jpeg', format: 'jpeg' };
  }
  if (ct.includes('svg') || looksLikeSvg(bytes)) {
    // Reject full HTML documents that merely mention svg
    if (/<!doctype html|<html/i.test(head)) {
      throw new Error('Invalid image: HTML/error page received instead of image bytes');
    }
    return { mimeType: 'image/svg+xml', format: 'svg' };
  }
  if (HTML_SNIFF.test(head) || /<!doctype html|<html/i.test(head)) {
    throw new Error('Invalid image: HTML/error page received instead of image bytes');
  }
  throw new Error('Invalid image: unrecognized binary format (expected PNG, JPEG, or SVG)');
}

/** @param {Buffer} png */
export function readPngDimensions(png) {
  if (!png.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new Error('Not a PNG');
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  return { width, height };
}

/** @param {Buffer} bytes */
export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Redact secrets from log/error text.
 * @param {string} text
 * @param {string[]} [secrets]
 */
export function redactSecrets(text, secrets = []) {
  let out = String(text);
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    out = out.split(secret).join('[REDACTED]');
  }
  return out
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_]+/g, '[REDACTED_SB]')
    .replace(/service_role[^\s]*/gi, '[REDACTED]');
}
