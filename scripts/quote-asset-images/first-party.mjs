/**
 * First-party host verification for logo downloads.
 */

/** Domains that must never be accepted as logo sources. */
export const DISALLOWED_HOST_SUFFIXES = Object.freeze([
  'clearbit.com',
  'logo.dev',
  'brandfetch.com',
  'coingecko.com',
  'coinmarketcap.com',
  'wikimedia.org',
  'wikipedia.org',
  'companiesmarketcap.com',
  'googleusercontent.com',
  'duckduckgo.com',
  'faviconkit.com',
  'icons8.com',
  'cdn.robinhood.com',
]);

/**
 * @param {string} hostname
 * @param {string[]} allowedHosts
 */
export function hostAllowed(hostname, allowedHosts) {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
  if (!host) return false;
  for (const bad of DISALLOWED_HOST_SUFFIXES) {
    if (host === bad || host.endsWith(`.${bad}`)) return false;
  }

  const allowed = (allowedHosts || []).map((h) => String(h).toLowerCase().replace(/\.$/, ''));
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

/**
 * @param {string} url
 * @param {string[]} allowedHosts
 */
export function assertFirstPartyUrl(url, allowedHosts) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Only https sources allowed (got ${parsed.protocol})`);
  }
  if (!hostAllowed(parsed.hostname, allowedHosts)) {
    throw new Error(
      `Host '${parsed.hostname}' is not on the first-party allowlist [${(allowedHosts || []).join(', ')}]`,
    );
  }
  return parsed;
}

/**
 * Follow redirects manually and reject third-party final hosts.
 * @param {string} url
 * @param {string[]} allowedHosts
 * @param {typeof fetch} [fetchFn]
 * @param {number} [maxRedirects]
 */
export async function fetchWithFirstPartyGuard(
  url,
  allowedHosts,
  fetchFn = globalThis.fetch,
  maxRedirects = 8,
) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    assertFirstPartyUrl(current, allowedHosts);
    const res = await fetchFn(current, {
      headers: { 'User-Agent': 'scoop-quote-asset-image-ingest/1.0' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error(`Redirect without Location from ${current}`);
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) {
      throw new Error(`Download failed HTTP ${res.status} for ${current}`);
    }
    const contentType = res.headers.get('content-type') || '';
    const ab = await res.arrayBuffer();
    return {
      bytes: Buffer.from(ab),
      contentType,
      finalUrl: current,
      redirectHops: i,
    };
  }
  throw new Error(`Too many redirects for ${url}`);
}
