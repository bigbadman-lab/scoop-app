/**
 * Safe logo loading for ImageResponse / Satori.
 * Never pass arbitrary remote URLs into next/og — that would create SSRF risk.
 * Only allowlisted public hosts are fetched, with timeout + size limits, into a data URI.
 */

const MAX_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 2_500;

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
]);

export function isOgSafeLogoUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) return false;
  if (host.endsWith('.local') || host.endsWith('.internal')) return false;
  // Block obvious private / link-local IPv4.
  if (/^(10\.|192\.168\.|169\.254\.|127\.)/.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;

  if (host === 'ipfs.io' || host.endsWith('.ipfs.io')) return true;
  if (host.endsWith('.supabase.co')) return true;
  if (host === 'scoop.fun' || host === 'www.scoop.fun') return true;
  return false;
}

/**
 * Fetch an allowlisted logo into a data URI for ImageResponse.
 * Returns null on any failure — callers must use a deterministic fallback.
 */
export async function loadOgLogoDataUri(
  candidateUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!candidateUrl || !isOgSafeLogoUrl(candidateUrl)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(candidateUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null;
    const mime =
      contentType.startsWith('image/') && !contentType.includes('svg')
        ? contentType.split(';')[0]!.trim()
        : sniffImageMime(buf);
    if (!mime) return null;
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46
  ) {
    return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}
