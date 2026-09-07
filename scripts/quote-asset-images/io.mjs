import { inflateRawSync } from 'node:zlib';
import { APPROVED_ASSETS, BUCKET, CHAIN_ID } from './sources.mjs';
import {
  assertImageBytes,
  readPngDimensions,
  redactSecrets,
  sha256Hex,
} from './validate.mjs';
import { fetchWithFirstPartyGuard } from './first-party.mjs';
import { TARGET_SIZE } from './chain.mjs';

/**
 * Minimal ZIP member extractor (store + deflate) without extra deps.
 * @param {Buffer} zipBytes
 * @param {string} memberPath
 */
export function extractZipMember(zipBytes, memberPath) {
  let eocd = -1;
  for (let i = zipBytes.length - 22; i >= 0; i--) {
    if (zipBytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Invalid ZIP: EOCD not found');
  const centralOffset = zipBytes.readUInt32LE(eocd + 16);
  const entries = zipBytes.readUInt16LE(eocd + 10);

  let p = centralOffset;
  for (let n = 0; n < entries; n++) {
    if (zipBytes.readUInt32LE(p) !== 0x02014b50) throw new Error('Invalid ZIP: bad central header');
    const method = zipBytes.readUInt16LE(p + 10);
    const compSize = zipBytes.readUInt32LE(p + 20);
    const nameLen = zipBytes.readUInt16LE(p + 28);
    const extraLen = zipBytes.readUInt16LE(p + 30);
    const commentLen = zipBytes.readUInt16LE(p + 32);
    const localOffset = zipBytes.readUInt32LE(p + 42);
    const name = zipBytes.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name !== memberPath) continue;

    if (zipBytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error('Invalid ZIP: bad local header');
    }
    const localNameLen = zipBytes.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = zipBytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) return Buffer.from(compressed);
    if (method === 8) return inflateRawSync(compressed);
    throw new Error(`Unsupported ZIP compression method ${method} for ${memberPath}`);
  }
  throw new Error(`ZIP member not found: ${memberPath}`);
}

/**
 * Unwrap an SVG sprite <symbol id="..."> into a standalone SVG document.
 * @param {Buffer} svgBytes
 * @param {string} symbolId
 */
export function unwrapSvgSymbol(svgBytes, symbolId) {
  const text = svgBytes.toString('utf8');
  const re = new RegExp(
    `<symbol\\b([^>]*\\bid=["']${symbolId}["'][^>]*)>([\\s\\S]*?)<\\/symbol>`,
    'i',
  );
  const m = text.match(re);
  if (!m) throw new Error(`SVG symbol id="${symbolId}" not found`);
  const attrs = m[1];
  const body = m[2].trim();
  const vb = attrs.match(/viewBox=["']([^"']+)["']/i);
  const viewBox = vb ? vb[1] : '0 0 100 100';
  const standalone = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>\n`;
  return Buffer.from(standalone, 'utf8');
}

/**
 * Build Coinbase LogoMark SVG from official CDS useLogo.ts source text.
 * @param {string} tsSource
 * @param {16|24|32} [size]
 */
export function buildCoinbaseLogoMarkSvg(tsSource, size = 32) {
  const blockRe = new RegExp(`${size}:\\s*\\{([\\s\\S]*?)\\},?\\s*(?:\\d+:|};)`, 'm');
  const block = tsSource.match(blockRe);
  if (!block) throw new Error(`Coinbase CDS logoMarkData missing size ${size}`);
  const viewBox = block[1].match(/viewBox:\s*['"]([^'"]+)['"]/);
  const path = block[1].match(/path:\s*['"]([^'"]+)['"]/);
  if (!viewBox || !path) throw new Error('Coinbase CDS logo mark path/viewBox not found');
  const color = '#0052FF';
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox[1]}" width="${size}" height="${size}">
  <path fill="${color}" d="${path[1]}"/>
</svg>
`;
  return Buffer.from(svg, 'utf8');
}

/**
 * @param {string} url
 * @param {typeof fetch} [fetchFn]
 * @param {string[]} [allowedHosts] if set, enforce first-party redirect guard
 */
export async function downloadBytes(url, fetchFn = globalThis.fetch, allowedHosts = null) {
  if (allowedHosts && allowedHosts.length) {
    return fetchWithFirstPartyGuard(url, allowedHosts, fetchFn);
  }
  const res = await fetchFn(url, {
    headers: { 'User-Agent': 'scoop-quote-asset-image-ingest/1.0' },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`Download failed HTTP ${res.status} for ${url}`);
  }
  const contentType = res.headers.get('content-type') || '';
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), contentType, finalUrl: url };
}

/**
 * @param {object} asset
 * @param {typeof fetch} [fetchFn]
 */
export async function loadApprovedSourceBytes(asset, fetchFn = globalThis.fetch) {
  const allowedHosts = asset.allowedHosts ?? null;
  const kind = asset.download?.kind;

  if (!kind) {
    throw new Error(`No download configured for ${asset.symbol} (status=${asset.logoStatus || 'unknown'})`);
  }

  if (kind === 'direct') {
    const { bytes, contentType, finalUrl } = await downloadBytes(
      asset.sourceUrl,
      fetchFn,
      allowedHosts,
    );
    const meta = assertImageBytes(bytes, contentType);
    return {
      bytes,
      contentType: meta.mimeType,
      downloadedFrom: finalUrl || asset.sourceUrl,
      finalUrl: finalUrl || asset.sourceUrl,
      packageUrl: null,
      memberPath: null,
    };
  }

  if (kind === 'zip_member') {
    const packageUrl = asset.download.packageUrl;
    const { bytes: zipBytes, contentType, finalUrl } = await downloadBytes(
      packageUrl,
      fetchFn,
      allowedHosts,
    );
    if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
      throw new Error(`Expected ZIP package, got content-type=${contentType}`);
    }
    const member = extractZipMember(zipBytes, asset.download.memberPath);
    const meta = assertImageBytes(member, 'image/png');
    return {
      bytes: member,
      contentType: meta.mimeType,
      downloadedFrom: finalUrl || packageUrl,
      finalUrl: finalUrl || packageUrl,
      packageUrl,
      memberPath: asset.download.memberPath,
    };
  }

  if (kind === 'svg_symbol') {
    const { bytes, contentType, finalUrl } = await downloadBytes(
      asset.sourceUrl,
      fetchFn,
      allowedHosts,
    );
    const unwrapped = unwrapSvgSymbol(bytes, asset.download.symbolId);
    const meta = assertImageBytes(unwrapped, contentType.includes('svg') ? contentType : 'image/svg+xml');
    return {
      bytes: unwrapped,
      contentType: meta.mimeType,
      downloadedFrom: finalUrl || asset.sourceUrl,
      finalUrl: finalUrl || asset.sourceUrl,
      packageUrl: null,
      memberPath: null,
    };
  }

  if (kind === 'coinbase_cds_logo_mark') {
    const { bytes, contentType, finalUrl } = await downloadBytes(
      asset.sourceUrl,
      fetchFn,
      allowedHosts,
    );
    const text = bytes.toString('utf8');
    if (!text.includes('logoMarkData') || text.includes('<!doctype html')) {
      throw new Error(`Expected Coinbase CDS TypeScript source, got content-type=${contentType}`);
    }
    const svg = buildCoinbaseLogoMarkSvg(text, asset.download.size ?? 32);
    const meta = assertImageBytes(svg, 'image/svg+xml');
    return {
      bytes: svg,
      contentType: meta.mimeType,
      downloadedFrom: finalUrl || asset.sourceUrl,
      finalUrl: finalUrl || asset.sourceUrl,
      packageUrl: null,
      memberPath: null,
    };
  }

  throw new Error(`Unknown download kind '${kind}' for ${asset.symbol}`);
}

/**
 * @param {string} supabaseUrl
 * @param {string} objectPath
 */
export function publicObjectUrl(supabaseUrl, objectPath) {
  const base = supabaseUrl.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function sqlNullableString(value) {
  if (value == null || value === '') return 'NULL';
  return `'${esc(value)}'`;
}

function metaMergeSql(prov) {
  const payload = { imageProvenance: prov };
  if (prov?.previousImageSource) {
    payload.previousImageSource = prov.previousImageSource;
  }
  const json = JSON.stringify(payload).replace(/'/g, "''");
  return `COALESCE(metadata, '{}'::jsonb) || '${json}'::jsonb`;
}

/**
 * Verify a manually uploaded storage object: must be exact 512×512 PNG.
 * Does not transform/reupload.
 * @param {Buffer|null|undefined} bytes
 * @param {{ symbol?: string }} [opts]
 */
export function verifyManualStoragePng(bytes, opts = {}) {
  const label = opts.symbol || 'manual';
  if (bytes == null) {
    return { ok: false, status: 'MISSING_MANUAL_STORAGE', message: `${label}: object missing` };
  }
  let meta;
  try {
    meta = assertImageBytes(bytes, 'image/png');
  } catch (err) {
    return {
      ok: false,
      status: 'FAIL',
      message: `${label}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (meta.format !== 'png') {
    return {
      ok: false,
      status: 'NEEDS_MANUAL_REUPLOAD',
      message: `${label}: expected PNG (got ${meta.format})`,
    };
  }
  let dims;
  try {
    dims = readPngDimensions(bytes);
  } catch (err) {
    return {
      ok: false,
      status: 'FAIL',
      message: `${label}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const sha256 = sha256Hex(bytes);
  if (dims.width !== TARGET_SIZE || dims.height !== TARGET_SIZE) {
    return {
      ok: false,
      status: 'NEEDS_MANUAL_REUPLOAD',
      message: `${label}: expected ${TARGET_SIZE}x${TARGET_SIZE}, got ${dims.width}x${dims.height}`,
      width: dims.width,
      height: dims.height,
      sha256,
      mimeType: meta.mimeType,
    };
  }
  return {
    ok: true,
    status: 'PASS_MANUAL_STORAGE',
    width: dims.width,
    height: dims.height,
    sha256,
    mimeType: meta.mimeType,
  };
}

/**
 * @param {object} row
 */
export function buildSingleAssetUpdateSql(row) {
  return `UPDATE quote_assets
SET
  image_url = '${esc(row.imageUrl)}',
  source_image_url = ${sqlNullableString(row.sourceImageUrl)},
  source_name = '${esc(row.sourceName)}',
  metadata = ${metaMergeSql(row.provenance)},
  updated_at = NOW()
WHERE chain_id = ${CHAIN_ID}
  AND lower(quote_asset) = lower('${esc(row.quoteAsset)}')
  AND symbol = '${esc(row.symbol)}';`;
}

/**
 * Generic SQL for one or more quote image rows.
 * @param {object[]} rows
 * @param {{ title?: string, notes?: string }} [opts]
 */
export function buildImageUpdateSql(rows, opts = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('buildImageUpdateSql requires at least one row');
  }
  const title = opts.title ?? `Updates ${rows.length} quote asset image field(s)`;
  const notes =
    opts.notes ??
    'Does NOT touch protocol fields, registration, oracles, category, or sort_order.';
  const symbols = rows.map((r) => r.symbol);

  return `-- Generated by scripts/ingest-quote-asset-images.mjs
-- Manual application only. ${title} on chain ${CHAIN_ID}.
-- ${notes}

BEGIN;

${rows.map(buildSingleAssetUpdateSql).join('\n\n')}

COMMIT;

-- Verification:
-- SELECT symbol, image_url, source_image_url, source_name
-- FROM quote_assets
-- WHERE chain_id = ${CHAIN_ID} AND symbol IN (${symbols.map((s) => `'${esc(s)}'`).join(', ')})
-- ORDER BY sort_order;
`;
}

/**
 * Back-compat ETH+USDG SQL helper used by existing tests.
 * @param {{ eth: object, usdg: object }} input
 */
export function buildUpdateSql(input) {
  const { eth, usdg } = input;
  return buildImageUpdateSql(
    [
      {
        symbol: 'ETH',
        quoteAsset: eth.quoteAsset,
        imageUrl: eth.imageUrl,
        sourceImageUrl: eth.sourceImageUrl,
        sourceName: eth.sourceName,
        provenance: eth.provenance,
      },
      {
        symbol: 'USDG',
        quoteAsset: usdg.quoteAsset,
        imageUrl: usdg.imageUrl,
        sourceImageUrl: usdg.sourceImageUrl,
        sourceName: usdg.sourceName,
        provenance: usdg.provenance,
      },
    ],
    {
      title: 'Updates ETH + USDG image fields',
      notes: 'Does NOT touch stocks, protocol fields, registration, oracles, or sort_order.',
    },
  );
}

/**
 * @param {Buffer | null | undefined} existingBytes
 * @param {string} localSha256
 * @returns {'missing'|'identical'|'conflict'}
 */
export function classifyExistingObject(existingBytes, localSha256) {
  if (existingBytes == null) return 'missing';
  const remoteSha = sha256Hex(existingBytes);
  if (remoteSha === localSha256) return 'identical';
  return 'conflict';
}

export { APPROVED_ASSETS, BUCKET, CHAIN_ID, redactSecrets, sha256Hex };
