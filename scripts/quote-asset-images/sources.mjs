/**
 * Approved quote-asset image sources.
 *
 * Native (ETH/USDG): first-party brand assets.
 * Stocks: first-party company/issuer logos from stock-logo-registry.mjs.
 *   Token addresses still come from the audited production catalogue.
 *   Robinhood logoUrl is retained only as previousImageSource provenance.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { BUCKET, CHAIN_ID, TARGET_SIZE } from './chain.mjs';
import {
  CANONICAL_STOCK_COUNT,
  CANONICAL_STOCK_SYMBOLS,
  MANUAL_STORAGE_SYMBOLS,
  STOCK_LOGO_REGISTRY,
  assertRegistryComplete,
  getAutomatedStockSymbols,
} from './stock-logo-registry.mjs';

export {
  BUCKET,
  CHAIN_ID,
  TARGET_SIZE,
  CANONICAL_STOCK_COUNT,
  CANONICAL_STOCK_SYMBOLS,
  MANUAL_STORAGE_SYMBOLS,
  getAutomatedStockSymbols,
};

/** Default ETH + USDG targets (backwards compatible). */
export const NATIVE_TARGET_SYMBOLS = Object.freeze(['ETH', 'USDG']);

/** @deprecated use NATIVE_TARGET_SYMBOLS — kept for existing tests */
export const TARGET_SYMBOLS = NATIVE_TARGET_SYMBOLS;

export const DEFAULT_STOCK_CATALOGUE_PATH = join(
  homedir(),
  'scoop-protocol',
  'audit',
  'final-production-stock-catalogue-20-live-audit.json',
);

export const APPROVED_NATIVE_ASSETS = {
  eth: {
    key: 'eth',
    group: 'native',
    symbol: 'ETH',
    quoteAsset: '0x0000000000000000000000000000000000000000',
    objectPath: `${CHAIN_ID}/eth.png`,
    sourceName: 'ethereum',
    sourcePage: 'https://ethereum.org/assets/',
    sourceUrl:
      'https://raw.githubusercontent.com/ethereum/ethereum-org-website/dev/public/images/assets/eth-glyph-colored.png',
    download: { kind: 'direct' },
  },
  usdg: {
    key: 'usdg',
    group: 'native',
    symbol: 'USDG',
    quoteAsset: '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
    objectPath: `${CHAIN_ID}/usdg.png`,
    sourceName: 'global-dollar',
    sourcePage: 'https://globaldollar.com/brand',
    sourceUrl:
      'https://424565.fs1.hubspotusercontent-na1.net/hubfs/424565/GDN_USDG_Token_32x32.png',
    download: {
      kind: 'zip_member',
      packageUrl: 'https://framerusercontent.com/assets/llo5qqG8OQbvOU2QpFJPTdUyn0.zip',
      memberPath: 'USDG Token/PNG/GDN_USDG_Token.png',
    },
  },
};

/** Back-compat alias used by existing ETH/USDG tests. */
export const APPROVED_ASSETS = APPROVED_NATIVE_ASSETS;

/**
 * Load token addresses + historical Robinhood logoUrl from audited catalogue.
 * @param {string} [cataloguePath]
 */
export function loadStockCatalogueRows(
  cataloguePath = process.env.SCOOP_STOCK_CATALOGUE_PATH || DEFAULT_STOCK_CATALOGUE_PATH,
) {
  if (!existsSync(cataloguePath)) {
    throw new Error(
      `Stock catalogue not found at ${cataloguePath}. Set SCOOP_STOCK_CATALOGUE_PATH or place the audited JSON at the default path.`,
    );
  }
  const raw = JSON.parse(readFileSync(cataloguePath, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error('Stock catalogue must be a JSON array');
  }

  const bySymbol = new Map();
  for (const row of raw) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    bySymbol.set(symbol, row);
  }

  const missing = CANONICAL_STOCK_SYMBOLS.filter((s) => !bySymbol.has(s));
  if (missing.length) {
    throw new Error(`Stock catalogue missing canonical symbols: ${missing.join(', ')}`);
  }
  const extras = [...bySymbol.keys()].filter((s) => !CANONICAL_STOCK_SYMBOLS.includes(s));
  if (extras.length) {
    throw new Error(
      `Stock catalogue has unexpected symbols (expected exactly ${CANONICAL_STOCK_COUNT}): ${extras.join(', ')}`,
    );
  }

  /** @type {Map<string, { token: string, logoUrl: string }>} */
  const out = new Map();
  for (const symbol of CANONICAL_STOCK_SYMBOLS) {
    const row = bySymbol.get(symbol);
    const logoUrl = String(row.logoUrl || '').trim();
    const token = String(row.token || '').trim().toLowerCase();
    if (!logoUrl.startsWith('https://cdn.robinhood.com/')) {
      throw new Error(`${symbol}: logoUrl must be a Robinhood CDN URL (got ${logoUrl || '(empty)'})`);
    }
    if (!/^0x[0-9a-f]{40}$/.test(token)) {
      throw new Error(`${symbol}: invalid token address`);
    }
    out.set(symbol, { token, logoUrl });
  }
  return out;
}

/**
 * Optional JSON map of manual symbol → official sourcePage URL.
 * Example: {"GME":"https://investor.gamestop.com/","MSTR":"https://www.strategy.com/",...}
 * @param {string} [raw]
 */
export function parseManualSourcePages(raw) {
  if (!raw || !String(raw).trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('SCOOP_MANUAL_LOGO_SOURCE_PAGES must be valid JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SCOOP_MANUAL_LOGO_SOURCE_PAGES must be a JSON object');
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    const symbol = String(k).toUpperCase();
    const page = String(v || '').trim();
    if (!page) continue;
    if (!page.startsWith('https://')) {
      throw new Error(`Manual sourcePage for ${symbol} must be https URL`);
    }
    out[symbol] = page;
  }
  return out;
}

/**
 * Build ingest assets from first-party registry + catalogue token addresses.
 * @param {string} [cataloguePath]
 * @returns {Array<object>}
 */
export function loadCanonicalStockAssets(
  cataloguePath = process.env.SCOOP_STOCK_CATALOGUE_PATH || DEFAULT_STOCK_CATALOGUE_PATH,
  opts = {},
) {
  assertRegistryComplete();
  const catalogue = loadStockCatalogueRows(cataloguePath);

  const env = opts.env ?? process.env;
  const manualPages = {
    ...parseManualSourcePages(env.SCOOP_MANUAL_LOGO_SOURCE_PAGES),
    ...(opts.manualSourcePages || {}),
  };

  /** @type {Array<object>} */
  const assets = [];
  for (const symbol of CANONICAL_STOCK_SYMBOLS) {
    const entry = STOCK_LOGO_REGISTRY[symbol];
    const cat = catalogue.get(symbol);
    const key = symbol.toLowerCase();
    const sourcePage =
      entry.mode === 'manual-storage'
        ? manualPages[symbol] || entry.sourcePage || null
        : entry.sourcePage;
    assets.push({
      key,
      group: 'stock',
      symbol,
      quoteAsset: cat.token,
      objectPath: entry.storagePath || `${CHAIN_ID}/${key}.png`,
      mode: entry.mode,
      sourceName: entry.sourceName,
      sourcePage,
      sourceUrl: entry.sourceUrl,
      download: entry.download,
      allowedHosts: entry.allowedHosts,
      logoStatus: entry.status,
      selectedVariant: entry.selectedVariant,
      companyName: entry.companyName,
      registryNotes: entry.notes,
      manualOfficialUpload: Boolean(entry.manualOfficialUpload),
      reviewDecision: entry.reviewDecision ?? null,
      reviewReason: entry.reviewReason ?? null,
      previousImageSource: {
        sourceName: 'robinhood',
        sourceUrl: cat.logoUrl,
      },
    });
  }

  if (assets.length !== CANONICAL_STOCK_COUNT) {
    throw new Error(`Expected ${CANONICAL_STOCK_COUNT} stock assets, got ${assets.length}`);
  }
  return assets;
}

/**
 * @param {'native'|'stocks'|'all'} target
 * @param {{ cataloguePath?: string, stockAssets?: object[] }} [opts]
 */
export function resolveTargetAssets(target, opts = {}) {
  const native = [APPROVED_NATIVE_ASSETS.eth, APPROVED_NATIVE_ASSETS.usdg];
  if (target === 'native') return native;
  const stocks =
    opts.stockAssets ??
    loadCanonicalStockAssets(opts.cataloguePath, {
      env: opts.env,
      manualSourcePages: opts.manualSourcePages,
    });
  if (target === 'stocks') return stocks;
  if (target === 'all') return [...native, ...stocks];
  throw new Error(`Unknown target '${target}' (use native|stocks|all)`);
}

/**
 * @param {string} symbol
 */
export function stockObjectPath(symbol) {
  return `${CHAIN_ID}/${String(symbol).toLowerCase()}.png`;
}
