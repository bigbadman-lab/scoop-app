import { describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { encode as encodeJpeg } from 'jpeg-js';
import { deflateRawSync } from 'node:zlib';
import { writeFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertImageBytes, redactSecrets, sha256Hex } from './validate.mjs';
import { fitToSquareRgba, normalizeToSquarePng, OUTPUT_SIZE } from './normalize.mjs';
import {
  buildCoinbaseLogoMarkSvg,
  buildImageUpdateSql,
  buildUpdateSql,
  classifyExistingObject,
  extractZipMember,
  unwrapSvgSymbol,
  verifyManualStoragePng,
} from './io.mjs';
import { hostAllowed, assertFirstPartyUrl } from './first-party.mjs';
import {
  APPROVED_ASSETS,
  CANONICAL_STOCK_COUNT,
  CANONICAL_STOCK_SYMBOLS,
  MANUAL_STORAGE_SYMBOLS,
  NATIVE_TARGET_SYMBOLS,
  TARGET_SYMBOLS,
  getAutomatedStockSymbols,
  loadCanonicalStockAssets,
  resolveTargetAssets,
  stockObjectPath,
} from './sources.mjs';
import {
  STOCK_LOGO_REGISTRY,
  assertRegistryComplete,
} from './stock-logo-registry.mjs';
import { runIngest } from './ingest.mjs';
import { parseArgs } from '../ingest-quote-asset-images.mjs';

function makePng(width, height, rgba = [0, 128, 255, 255]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return PNG.sync.write(png);
}

function makeJpegStub() {
  const width = 8;
  const height = 8;
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 200;
    data[i * 4 + 1] = 20;
    data[i * 4 + 2] = 20;
    data[i * 4 + 3] = 255;
  }
  return encodeJpeg({ data, width, height }, 90).data;
}

function makeZipWithMember(memberPath, fileBytes) {
  const name = Buffer.from(memberPath);
  const compressed = deflateRawSync(fileBytes);
  const local = Buffer.alloc(30 + name.length + compressed.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(fileBytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  name.copy(local, 30);
  compressed.copy(local, 30 + name.length);

  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(fileBytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  name.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, central, eocd]);
}

/** Mixed fixtures: 16 automated + 4 manual-storage. */
function fakeStockAssets() {
  return CANONICAL_STOCK_SYMBOLS.map((symbol, i) => {
    const key = symbol.toLowerCase();
    const token = `0x${String(i + 1).padStart(40, '0')}`;
    const entry = STOCK_LOGO_REGISTRY[symbol];
    const isManual = entry.mode === 'manual-storage';
    if (isManual) {
      return {
        key,
        group: 'stock',
        symbol,
        quoteAsset: token,
        objectPath: `4663/${key}.png`,
        mode: 'manual-storage',
        sourceName: entry.sourceName,
        sourcePage: `https://official.example/${key}/brand`,
        sourceUrl: null,
        download: null,
        allowedHosts: entry.allowedHosts,
        logoStatus: 'MANUAL_STORAGE',
        companyName: entry.companyName,
        manualOfficialUpload: true,
        previousImageSource: {
          sourceName: 'robinhood',
          sourceUrl: `https://cdn.robinhood.com/ncw_assets/logos/${token}.png`,
        },
      };
    }
    const host = `${key}.example-corp.test`;
    return {
      key,
      group: 'stock',
      symbol,
      quoteAsset: token,
      objectPath: `4663/${key}.png`,
      mode: 'automated-first-party',
      sourceName: entry.sourceName,
      sourcePage: `https://${host}/brand`,
      sourceUrl: `https://${host}/logos/${key}.png`,
      download: { kind: 'direct' },
      allowedHosts: [host],
      logoStatus: 'PASS',
      selectedVariant: 'test fixture',
      companyName: entry.companyName,
      reviewDecision: entry.reviewDecision ?? null,
      reviewReason: entry.reviewReason ?? null,
      previousImageSource: {
        sourceName: 'robinhood',
        sourceUrl: `https://cdn.robinhood.com/ncw_assets/logos/${token}.png`,
      },
    };
  });
}

function makeDistinctManualPngs() {
  /** @type {Record<string, Buffer>} */
  const out = {};
  MANUAL_STORAGE_SYMBOLS.forEach((symbol, i) => {
    out[symbol.toLowerCase()] = makePng(512, 512, [(i + 1) * 40, 10, 200 - i * 20, 255]);
  });
  return out;
}

describe('quote asset image validation', () => {
  it('accepts PNG/JPEG/SVG and rejects HTML', () => {
    const png = makePng(8, 8);
    expect(assertImageBytes(png, 'image/png').format).toBe('png');
    expect(assertImageBytes(makeJpegStub(), 'image/jpeg').format).toBe('jpeg');
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
    );
    expect(assertImageBytes(svg, 'image/svg+xml').format).toBe('svg');
    expect(() => assertImageBytes(Buffer.from('<!doctype html><html>nope'), 'text/html')).toThrow(
      /HTML|content-type/,
    );
    expect(() =>
      assertImageBytes(Buffer.from('{"error":true}'.padEnd(64, ' ')), 'application/json'),
    ).toThrow(/content-type|HTML|unrecognized/);
  });

  it('redacts secrets', () => {
    const secret = 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG';
    expect(redactSecrets(`token=${secret}`, [secret])).not.toContain(secret);
    expect(redactSecrets('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb')).toContain('[REDACTED_JWT]');
  });
});

describe('normalization', () => {
  it('outputs 512x512 PNG preserving aspect ratio (no stretch)', () => {
    const src = makePng(100, 50);
    const out = normalizeToSquarePng(src);
    expect(out.outputWidth).toBe(OUTPUT_SIZE);
    expect(out.outputHeight).toBe(OUTPUT_SIZE);
    expect(out.drawnWidth / out.drawnHeight).toBeCloseTo(2, 1);
    expect(out.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(assertImageBytes(out.bytes).format).toBe('png');
  });

  it('rasterizes SVG and JPEG to 512x512', () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#0a0"/></svg>',
    );
    const fromSvg = normalizeToSquarePng(svg, 'image/svg+xml');
    expect(fromSvg.outputWidth).toBe(512);
    expect(fromSvg.originalMimeType).toBe('image/svg+xml');

    const fromJpeg = normalizeToSquarePng(makeJpegStub(), 'image/jpeg');
    expect(fromJpeg.outputWidth).toBe(512);
    expect(fromJpeg.originalMimeType).toBe('image/jpeg');
  });

  it('fitToSquareRgba centers content', () => {
    const rgba = {
      width: 10,
      height: 10,
      data: Buffer.alloc(10 * 10 * 4, 255),
    };
    const fitted = fitToSquareRgba(rgba, 100);
    expect(fitted.width).toBe(100);
    expect(fitted.drawnWidth).toBe(100);
  });
});

describe('first-party host guards', () => {
  it('allows listed hosts and rejects aggregators / robinhood', () => {
    expect(hostAllowed('www.apple.com', ['www.apple.com', 'apple.com'])).toBe(true);
    expect(hostAllowed('logo.clearbit.com', ['logo.clearbit.com'])).toBe(false);
    expect(hostAllowed('cdn.robinhood.com', ['cdn.robinhood.com'])).toBe(false);
    expect(() => assertFirstPartyUrl('https://brandfetch.com/x.png', ['brandfetch.com'])).toThrow(
      /not on the first-party allowlist|Host/,
    );
  });

  it('rejects redirects conceptually via allowlist mismatch', () => {
    expect(hostAllowed('evil.example', ['www.nvidia.com'])).toBe(false);
  });
});

describe('first-party stock registry', () => {
  it('has exact 20 entries: 16 automated + 4 manual-storage; TSLA accepted', () => {
    assertRegistryComplete();
    expect(Object.keys(STOCK_LOGO_REGISTRY)).toHaveLength(20);
    expect(getAutomatedStockSymbols()).toHaveLength(16);
    expect(MANUAL_STORAGE_SYMBOLS).toEqual(['GME', 'MSTR', 'SNDK', 'TSM']);
    expect(STOCK_LOGO_REGISTRY.TSLA.status).toBe('PASS');
    expect(STOCK_LOGO_REGISTRY.TSLA.reviewDecision).toBe('approved');
    for (const symbol of CANONICAL_STOCK_SYMBOLS) {
      const e = STOCK_LOGO_REGISTRY[symbol];
      expect(e.allowedHosts?.length).toBeGreaterThan(0);
      expect(e.sourceName).toBeTruthy();
      if (e.mode === 'manual-storage') {
        expect(e.sourcePage).toBeNull();
        expect(e.manualOfficialUpload).toBe(true);
        expect(e.storagePath).toBe(`4663/${symbol.toLowerCase()}.png`);
      } else {
        expect(e.sourcePage).toMatch(/^https:\/\//);
        expect(e.status).toBe('PASS');
      }
    }
  });
});

describe('canonical stock catalogue', () => {
  it('has exact count, symbol set, and ordering', () => {
    expect(CANONICAL_STOCK_COUNT).toBe(20);
    expect(CANONICAL_STOCK_SYMBOLS).toEqual([
      'AAPL',
      'AMD',
      'AMZN',
      'ASML',
      'BABA',
      'COIN',
      'CRCL',
      'GME',
      'GOOGL',
      'INTC',
      'META',
      'MSFT',
      'MSTR',
      'MU',
      'NVDA',
      'PLTR',
      'SNDK',
      'SPCX',
      'TSLA',
      'TSM',
    ]);
    expect([...CANONICAL_STOCK_SYMBOLS].sort()).toEqual([...CANONICAL_STOCK_SYMBOLS]);
  });

  it('generates lowercase ticker PNG paths', () => {
    expect(stockObjectPath('AAPL')).toBe('4663/aapl.png');
    expect(stockObjectPath('TSLA')).toBe('4663/tsla.png');
  });

  it('loads audited catalogue + first-party registry when present', () => {
    let assets;
    try {
      assets = loadCanonicalStockAssets();
    } catch (err) {
      expect(String(err.message)).toMatch(/Stock catalogue not found/);
      return;
    }
    expect(assets).toHaveLength(20);
    expect(assets.map((a) => a.symbol)).toEqual([...CANONICAL_STOCK_SYMBOLS]);
    for (const a of assets) {
      expect(a.sourceName).not.toBe('robinhood');
      expect(a.sourceName).toBe(STOCK_LOGO_REGISTRY[a.symbol].sourceName);
      expect(a.previousImageSource.sourceName).toBe('robinhood');
      expect(a.mode).toBe(STOCK_LOGO_REGISTRY[a.symbol].mode);
      expect(a.objectPath).toBe(`4663/${a.symbol.toLowerCase()}.png`);
      expect(a.group).toBe('stock');
    }
    expect(assets.filter((a) => a.mode === 'manual-storage')).toHaveLength(4);
    expect(assets.filter((a) => a.mode === 'automated-first-party')).toHaveLength(16);
  });

  it('aborts when catalogue count is wrong', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scoop-cat-'));
    const path = join(dir, 'bad.json');
    await writeFile(
      path,
      JSON.stringify([
        {
          symbol: 'AAPL',
          token: '0x' + '1'.repeat(40),
          logoUrl: 'https://cdn.robinhood.com/x.png',
        },
      ]),
    );
    expect(() => loadCanonicalStockAssets(path)).toThrow(/missing canonical symbols/);
  });

  it('resolveTargetAssets stocks excludes ETH/USDG', () => {
    const stocks = resolveTargetAssets('stocks', { stockAssets: fakeStockAssets() });
    expect(stocks).toHaveLength(20);
    expect(stocks.some((a) => a.symbol === 'ETH' || a.symbol === 'USDG')).toBe(false);
    expect(resolveTargetAssets('native').map((a) => a.symbol)).toEqual(['ETH', 'USDG']);
    expect(TARGET_SYMBOLS).toEqual(NATIVE_TARGET_SYMBOLS);
  });
});

describe('CLI args', () => {
  it('defaults to native and supports --stocks / --all', () => {
    expect(parseArgs([]).target).toBe('native');
    expect(parseArgs(['--stocks']).target).toBe('stocks');
    expect(parseArgs(['--all']).target).toBe('all');
    expect(parseArgs(['--target', 'stocks']).target).toBe('stocks');
    expect(parseArgs(['--stocks', '--upload']).upload).toBe(true);
  });
});

describe('zip + svg + sql + storage classification', () => {
  it('extracts zip member', () => {
    const file = makePng(4, 4);
    const zip = makeZipWithMember('USDG Token/PNG/GDN_USDG_Token.png', file);
    const out = extractZipMember(zip, 'USDG Token/PNG/GDN_USDG_Token.png');
    expect(sha256Hex(out)).toBe(sha256Hex(file));
  });

  it('unwraps svg symbol sprites', () => {
    const sprite = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="logo" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></svg>`,
    );
    const out = unwrapSvgSymbol(sprite, 'logo');
    expect(out.toString('utf8')).toContain('viewBox="0 0 10 10"');
    expect(assertImageBytes(out, 'image/svg+xml').format).toBe('svg');
  });

  it('builds Coinbase logo mark SVG from CDS source', () => {
    const ts = `
const logoMarkData = {
 32: {
 viewBox: '0 0 48 48',
 path: 'M24,36c-6.63,0-12-5.37-12-12z',
 },
};
`;
    const svg = buildCoinbaseLogoMarkSvg(ts, 32);
    expect(svg.toString('utf8')).toContain('viewBox="0 0 48 48"');
    expect(svg.toString('utf8')).toContain('#0052FF');
  });

  it('SQL updates only ETH + USDG image fields', () => {
    const sql = buildUpdateSql({
      eth: {
        quoteAsset: APPROVED_ASSETS.eth.quoteAsset,
        imageUrl: 'https://example.supabase.co/storage/v1/object/public/quote-assets/4663/eth.png',
        sourceImageUrl: APPROVED_ASSETS.eth.sourceUrl,
        sourceName: 'ethereum',
        provenance: { sha256: 'abc', width: 512, height: 512, sourcePage: 'https://ethereum.org/assets/' },
      },
      usdg: {
        quoteAsset: APPROVED_ASSETS.usdg.quoteAsset,
        imageUrl: 'https://example.supabase.co/storage/v1/object/public/quote-assets/4663/usdg.png',
        sourceImageUrl: APPROVED_ASSETS.usdg.sourceUrl,
        sourceName: 'global-dollar',
        provenance: { sha256: 'def', width: 512, height: 512, sourcePage: 'https://globaldollar.com/brand' },
      },
    });
    expect(sql).toContain("symbol = 'ETH'");
    expect(sql).toContain("symbol = 'USDG'");
    expect(sql).toContain('image_url');
    expect(sql).toContain('source_image_url');
    expect(sql).toContain('source_name');
    expect(sql).toContain('imageProvenance');
    expect(sql).not.toMatch(/quote_type\s*=/);
    expect(sql).not.toMatch(/is_registered\s*=/);
    expect(sql).not.toMatch(/oracle_feed\s*=/);
    expect(sql).not.toMatch(/sort_order\s*=/);
    expect(sql).not.toContain('AAPL');
  });

  it('stock SQL has exactly 20 UPDATEs with first-party source_name and previousImageSource', () => {
    const stocks = fakeStockAssets();
    const rows = stocks.map((a) => ({
      symbol: a.symbol,
      quoteAsset: a.quoteAsset,
      imageUrl: `https://example.supabase.co/storage/v1/object/public/quote-assets/${a.objectPath}`,
      sourceImageUrl: a.sourceUrl,
      sourceName: a.sourceName,
      provenance: {
        sourcePage: a.sourcePage,
        sourceUrl: a.sourceUrl,
        sha256: 'norm',
        sourceSha256: 'src',
        width: 512,
        height: 512,
        previousImageSource: a.previousImageSource,
      },
    }));
    const sql = buildImageUpdateSql(rows, {
      title: 'Updates 20 stock quote asset image fields',
      notes: 'Stock-only.',
    });
    expect((sql.match(/^UPDATE quote_assets$/gm) || []).length).toBe(20);
    expect(sql).toContain("source_name = 'apple'");
    expect(sql).toContain('previousImageSource');
    expect(sql).toContain('cdn.robinhood.com');
    expect(sql).not.toMatch(/quote_type\s*=/);
    expect(sql).not.toMatch(/is_enabled\s*=/);
    expect(sql).not.toMatch(/oracle_max_age\s*=/);
    expect(sql).not.toContain("symbol = 'ETH'");
    expect(sql).not.toContain("symbol = 'USDG'");
    for (const symbol of CANONICAL_STOCK_SYMBOLS) {
      expect(sql).toContain(`symbol = '${symbol}'`);
    }
  });

  it('classifies existing objects safely', () => {
    const bytes = makePng(2, 2);
    const hash = sha256Hex(bytes);
    expect(classifyExistingObject(null, hash)).toBe('missing');
    expect(classifyExistingObject(bytes, hash)).toBe('identical');
    expect(classifyExistingObject(makePng(2, 2, [1, 2, 3, 255]), hash)).toBe('conflict');
  });
});

describe('runIngest dry-run', () => {
  it('native mode performs zero uploads and zero DB writes', async () => {
    const ethPng = makePng(40, 60, [30, 30, 200, 255]);
    const usdgPng = makePng(50, 50, [49, 64, 18, 255]);
    const zip = makeZipWithMember('USDG Token/PNG/GDN_USDG_Token.png', usdgPng);

    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('eth-glyph-colored')) {
        return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => ethPng };
      }
      if (u.includes('llo5qqG8OQbvOU2QpFJPTdUyn0.zip')) {
        return { ok: true, status: 200, headers: { get: () => 'application/zip' }, arrayBuffer: async () => zip };
      }
      throw new Error(`unexpected fetch ${u}`);
    });

    const uploads = [];
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-'));
    const sqlOutPath = join(workspaceDir, 'update.sql');
    const logs = [];

    const result = await runIngest({
      target: 'native',
      upload: false,
      fetchFn,
      storage: {
        listBuckets: async () => [{ id: 'quote-assets', name: 'quote-assets' }],
        download: async () => null,
        upload: async (path, bytes) => uploads.push({ path, bytes }),
      },
      workspaceDir,
      sqlOutPath,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
      },
      logger: {
        log: (...a) => logs.push(a.join(' ')),
        error: (...a) => logs.push(a.join(' ')),
      },
    });

    expect(result.dbMutations).toBe(0);
    expect(uploads).toHaveLength(0);
    expect(result.targets).toEqual(['ETH', 'USDG']);
    expect(result.prepared.eth.normalized.outputWidth).toBe(512);
    const sql = await readFile(sqlOutPath, 'utf8');
    expect(sql).toContain('ETH');
    expect(sql).not.toContain('TEST_SERVICE_ROLE_KEY_DO_NOT_LOG');
    expect(logs.join('\n')).not.toContain('TEST_SERVICE_ROLE_KEY_DO_NOT_LOG');
  });

  it('stock dry-run with manuals missing withholds SQL; 16 automated still process', async () => {
    const stocks = fakeStockAssets();
    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      const stock = stocks.find((s) => u === s.sourceUrl);
      if (!stock) throw new Error(`bad url ${url}`);
      const idx = stocks.indexOf(stock);
      const png = makePng(32, 32, [(idx * 11) % 200, 40, 80, 255]);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png,
      };
    });
    const uploads = [];
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-stocks-'));
    const sqlOutPath = join(workspaceDir, 'stocks.sql');
    const auditOutPath = join(workspaceDir, 'audit.json');

    const result = await runIngest({
      target: 'stocks',
      stockAssets: stocks,
      upload: false,
      fetchFn,
      workspaceDir,
      sqlOutPath,
      auditOutPath,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        // no service key → manuals not inspected → MISSING
      },
      storage: undefined,
      logger: { log: () => {}, error: () => {} },
    });

    expect(result.targets).toHaveLength(20);
    expect(result.automatedReady).toBe(16);
    expect(result.manualReady).toBe(0);
    expect(result.stocksReady).toBe(false);
    expect(result.sqlOutPath).toBeNull();
    expect(result.dbMutations).toBe(0);
    expect(uploads).toHaveLength(0);
    expect(result.prepared.aapl.asset.sourceName).toBe('apple');
    expect(result.prepared.tsla.provenance.reviewDecision).toBe('approved');
    expect(result.prepared.gme).toBeUndefined();

    const audit = JSON.parse(await readFile(auditOutPath, 'utf8'));
    expect(audit.summary.passAutomated).toBe(16);
    expect(audit.summary.missingManualStorage).toBe(4);
    await expect(readFile(sqlOutPath, 'utf8')).rejects.toThrow();
  });

  it('stock dry-run with 4 valid manual 512 PNGs generates 20-update SQL', async () => {
    const stocks = fakeStockAssets();
    const manuals = makeDistinctManualPngs();
    const fetchFn = vi.fn(async (url) => {
      const stock = stocks.find((s) => String(url) === s.sourceUrl);
      if (!stock) throw new Error(`bad url ${url}`);
      const idx = stocks.indexOf(stock);
      const png = makePng(32, 32, [(idx * 13) % 200, 80, 20, 255]);
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png,
      };
    });
    const uploads = [];
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-ready-'));
    const sqlOutPath = join(workspaceDir, 'stocks.sql');
    const auditOutPath = join(workspaceDir, 'audit.json');

    const result = await runIngest({
      target: 'stocks',
      stockAssets: stocks,
      upload: false,
      fetchFn,
      workspaceDir,
      sqlOutPath,
      auditOutPath,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
      },
      storage: {
        listBuckets: async () => [{ id: 'quote-assets' }],
        download: async (path) => {
          const key = path.replace(/^4663\//, '').replace(/\.png$/, '');
          return manuals[key] ?? null;
        },
        upload: async (...args) => uploads.push(args),
      },
      logger: { log: () => {}, error: () => {} },
    });

    expect(result.stocksReady).toBe(true);
    expect(result.automatedReady).toBe(16);
    expect(result.manualReady).toBe(4);
    expect(result.dbMutations).toBe(0);
    expect(uploads).toHaveLength(0);
    expect(result.prepared.gme.skipUpload).toBe(true);
    expect(result.prepared.gme.provenance.manualOfficialUpload).toBe(true);
    expect(result.prepared.gme.provenance.sourceUrl).toBeNull();

    const sql = await readFile(sqlOutPath, 'utf8');
    expect((sql.match(/^UPDATE quote_assets$/gm) || []).length).toBe(20);
    expect(sql).toContain("source_name = 'gamestop'");
    expect(sql).toContain('source_image_url = NULL');
    expect(sql).toContain("source_name = 'tesla'");
    expect(sql).not.toContain("symbol = 'ETH'");
    expect(sql).not.toContain('TEST_SERVICE_ROLE_KEY_DO_NOT_LOG');

    const audit = JSON.parse(await readFile(auditOutPath, 'utf8'));
    expect(audit.summary.passAutomated).toBe(16);
    expect(audit.summary.passManualStorage).toBe(4);
    expect(audit.stocks.find((s) => s.symbol === 'TSLA').status).toBe('PASS_AUTOMATED');
  });

  it('manual sourcePage required blocks SQL even if object is valid', async () => {
    const stocks = fakeStockAssets().map((s) =>
      s.mode === 'manual-storage' ? { ...s, sourcePage: null } : s,
    );
    const manuals = makeDistinctManualPngs();
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-meta-'));
    const result = await runIngest({
      target: 'stocks',
      stockAssets: stocks,
      upload: false,
      workspaceDir,
      sqlOutPath: join(workspaceDir, 'x.sql'),
      auditOutPath: join(workspaceDir, 'a.json'),
      fetchFn: async (url) => {
        const stock = stocks.find((s) => s.sourceUrl === String(url));
        const idx = Math.max(0, stocks.indexOf(stock));
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => makePng(16, 16, [idx, 2, 3, 255]),
        };
      },
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
      },
      storage: {
        download: async (path) => {
          const key = path.replace(/^4663\//, '').replace(/\.png$/, '');
          return manuals[key] ?? null;
        },
        upload: async () => {},
        listBuckets: async () => [{ id: 'quote-assets' }],
      },
      logger: { log: () => {}, error: () => {} },
    });
    expect(result.stocksReady).toBe(false);
    expect(result.sqlOutPath).toBeNull();
    expect(result.auditRows.some((r) => r.status === 'MANUAL_SOURCE_METADATA_REQUIRED')).toBe(
      true,
    );
  });

  it('manual wrong dimensions / non-PNG / duplicate hash rejected', async () => {
    expect(verifyManualStoragePng(null, { symbol: 'GME' }).status).toBe('MISSING_MANUAL_STORAGE');
    expect(verifyManualStoragePng(makePng(256, 256), { symbol: 'GME' }).status).toBe(
      'NEEDS_MANUAL_REUPLOAD',
    );
    expect(
      verifyManualStoragePng(Buffer.from('<!doctype html><html>x</html>'), { symbol: 'GME' }).status,
    ).toBe('FAIL');

    const stocks = fakeStockAssets();
    const same = makePng(512, 512, [9, 9, 9, 255]);
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-mdup-'));
    await expect(
      runIngest({
        target: 'stocks',
        stockAssets: stocks,
        upload: false,
        workspaceDir,
        sqlOutPath: join(workspaceDir, 'x.sql'),
        auditOutPath: join(workspaceDir, 'a.json'),
        fetchFn: async (url) => {
          const stock = stocks.find((s) => s.sourceUrl === String(url));
          const idx = Math.max(0, stocks.indexOf(stock));
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'image/png' },
            arrayBuffer: async () => makePng(20, 20, [idx * 3, 4, 5, 255]),
          };
        },
        env: {
          NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
        },
        storage: {
          download: async () => same,
          upload: async () => {},
          listBuckets: async () => [{ id: 'quote-assets' }],
        },
        logger: { log: () => {}, error: () => {} },
      }),
    ).rejects.toThrow(/Duplicate stock normalized\/storage hashes/i);
  });

  it('invalid automated stock source aborts before SQL completeness', async () => {
    const stocks = fakeStockAssets();
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-fail-'));
    await expect(
      runIngest({
        target: 'stocks',
        stockAssets: stocks,
        upload: false,
        workspaceDir,
        sqlOutPath: join(workspaceDir, 'x.sql'),
        auditOutPath: join(workspaceDir, 'a.json'),
        fetchFn: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => 'text/html' },
          arrayBuffer: async () => Buffer.from('<!doctype html><html>err</html>'),
        }),
        env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' },
        logger: { log: () => {}, error: () => {} },
      }),
    ).rejects.toThrow(/AAPL: source fetch\/validation failed/);
  });

  it('aborts on conflicting remote object without overwrite; overwrite must be explicit', async () => {
    const ethPng = makePng(20, 20);
    const usdgPng = makePng(20, 20, [10, 20, 30, 255]);
    const zip = makeZipWithMember('USDG Token/PNG/GDN_USDG_Token.png', usdgPng);
    const fetchFn = vi.fn(async (url) => {
      const u = String(url);
      const body = u.includes('zip') ? zip : ethPng;
      return {
        ok: true,
        status: 200,
        headers: { get: () => (u.includes('zip') ? 'application/zip' : 'image/png') },
        arrayBuffer: async () => body,
      };
    });

    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-'));
    await expect(
      runIngest({
        target: 'native',
        upload: true,
        overwrite: false,
        fetchFn,
        workspaceDir,
        sqlOutPath: join(workspaceDir, 'x.sql'),
        env: {
          NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
        },
        storage: {
          listBuckets: async () => [{ id: 'quote-assets', name: 'quote-assets' }],
          download: async () => makePng(3, 3, [9, 9, 9, 255]),
          upload: async () => {
            throw new Error('should not upload');
          },
          uploadUpsert: async () => {
            throw new Error('should not upsert');
          },
        },
        logger: { log: () => {}, error: () => {} },
      }),
    ).rejects.toThrow(/Refusing to overwrite/);
  });

  it('aborts when automated stock sources are identical placeholders', async () => {
    const stocks = fakeStockAssets();
    const same = makePng(24, 24, [0, 200, 0, 255]);
    const manuals = makeDistinctManualPngs();
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-dup-'));
    await expect(
      runIngest({
        target: 'stocks',
        stockAssets: stocks,
        upload: false,
        workspaceDir,
        sqlOutPath: join(workspaceDir, 'should-not-matter.sql'),
        auditOutPath: join(workspaceDir, 'audit.json'),
        writeSql: true,
        fetchFn: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => 'image/png' },
          arrayBuffer: async () => same,
        }),
        env: {
          NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
        },
        storage: {
          download: async (path) => {
            const key = path.replace(/^4663\//, '').replace(/\.png$/, '');
            return manuals[key] ?? null;
          },
          upload: async () => {},
          listBuckets: async () => [{ id: 'quote-assets' }],
        },
        logger: { log: () => {}, error: () => {} },
      }),
    ).rejects.toThrow(/Duplicate automated stock source hashes/i);
  });

  it('upload skips manual-storage objects and skips identical automated objects', async () => {
    const stocks = fakeStockAssets().filter((s) => s.symbol === 'AAPL' || s.symbol === 'GME');
    const png = makePng(16, 16);
    const normalized = normalizeToSquarePng(png);
    const manual = makePng(512, 512, [1, 2, 3, 255]);
    const uploads = [];
    const workspaceDir = await mkdtemp(join(tmpdir(), 'scoop-qi-ident-'));

    const result = await runIngest({
      target: 'stocks',
      stockAssets: stocks,
      upload: true,
      workspaceDir,
      sqlOutPath: join(workspaceDir, 'one.sql'),
      auditOutPath: join(workspaceDir, 'audit.json'),
      fetchFn: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png,
      }),
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'TEST_SERVICE_ROLE_KEY_DO_NOT_LOG',
      },
      storage: {
        listBuckets: async () => [{ id: 'quote-assets', name: 'quote-assets' }],
        download: async (path) => {
          if (path.includes('gme')) return manual;
          return normalized.bytes;
        },
        upload: async (...a) => uploads.push(a),
      },
      logger: { log: () => {}, error: () => {} },
    });

    expect(result.storageStatus.aapl).toBe('identical');
    expect(result.prepared.gme.skipUpload).toBe(true);
    expect(uploads).toHaveLength(0);
  });
});

describe('manual SQL nullable source_image_url', () => {
  it('emits NULL for missing direct URL and keeps issuer source_name', () => {
    const sql = buildImageUpdateSql(
      [
        {
          symbol: 'GME',
          quoteAsset: '0x' + '1'.repeat(40),
          imageUrl: 'https://example.supabase.co/storage/v1/object/public/quote-assets/4663/gme.png',
          sourceImageUrl: null,
          sourceName: 'gamestop',
          provenance: {
            manualOfficialUpload: true,
            sourcePage: 'https://investor.gamestop.com/',
            storagePath: 'quote-assets/4663/gme.png',
            width: 512,
            height: 512,
            sha256: 'abc',
          },
        },
      ],
      { title: 'manual', notes: 'Stock-only.' },
    );
    expect(sql).toContain('source_image_url = NULL');
    expect(sql).toContain("source_name = 'gamestop'");
    expect(sql).toContain('manualOfficialUpload');
  });
});
