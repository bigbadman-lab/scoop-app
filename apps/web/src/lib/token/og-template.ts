/**
 * Load the token OG background template for ImageResponse.
 * Prefer local public file (with NFT tracing); fall back to HTTPS fetch.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { absoluteSeoUrl } from '@/lib/seo/site';

export const TOKEN_OG_TEMPLATE_PUBLIC_PATH = '/brand/token-template.png';

const FETCH_TIMEOUT_MS = 3_000;

let cached: Promise<string | null> | null = null;

function candidateFsPaths(): string[] {
  const cwd = process.cwd();
  return [
    join(cwd, 'public/brand/token-template.png'),
    // Monorepo / tracing root may place cwd at repo root.
    join(cwd, 'apps/web/public/brand/token-template.png'),
  ];
}

async function readTemplateFromFs(): Promise<string | null> {
  for (const path of candidateFsPaths()) {
    try {
      const buf = await readFile(path);
      if (buf.byteLength < 32) continue;
      if (buf[0] !== 0x89 || buf[1] !== 0x50) continue; // PNG magic
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      // try next path
    }
  }
  return null;
}

async function fetchTemplateDataUri(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = absoluteSeoUrl(TOKEN_OG_TEMPLATE_PUBLIC_PATH);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Accept: 'image/png,image/*;q=0.8' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 32) return null;
    if (buf[0] !== 0x89 || buf[1] !== 0x50) return null;
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a PNG data URI for the OG template, or null when unavailable.
 * Callers must degrade to a solid-background card when null.
 */
export async function loadTokenOgTemplateDataUri(
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      const fromFs = await readTemplateFromFs();
      if (fromFs) return fromFs;
      return fetchTemplateDataUri(fetchImpl);
    })();
  }
  return cached;
}

/** Test helper — clear memoized template between cases. */
export function resetTokenOgTemplateCache(): void {
  cached = null;
}
