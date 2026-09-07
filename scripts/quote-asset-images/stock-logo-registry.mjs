/**
 * First-party stock logo source registry.
 *
 * Modes:
 * - automated-first-party: download/normalize/upload via pipeline
 * - manual-storage: human uploads PNG to Supabase; pipeline verifies only
 *
 * Robinhood CDN retained only as previousImageSource provenance.
 */

import { CHAIN_ID } from './chain.mjs';

/** @typedef {'PASS'|'MANUAL_STORAGE'} RegistryStatus */
/** @typedef {'automated-first-party'|'manual-storage'} LogoMode */

/** Canonical production stock set (alphabetical). Exactly 20. */
export const CANONICAL_STOCK_SYMBOLS = Object.freeze([
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

export const CANONICAL_STOCK_COUNT = CANONICAL_STOCK_SYMBOLS.length;

export const MANUAL_STORAGE_SYMBOLS = Object.freeze(['GME', 'MSTR', 'SNDK', 'TSM']);

/**
 * @type {Record<string, object>}
 */
export const STOCK_LOGO_REGISTRY = {
  AAPL: {
    symbol: 'AAPL',
    companyName: 'Apple',
    mode: 'automated-first-party',
    sourceName: 'apple',
    sourcePage: 'https://www.apple.com/newsroom/',
    sourceUrl: 'https://www.apple.com/ac/structured-data/images/knowledge_graph_logo.png',
    download: { kind: 'direct' },
    allowedHosts: ['www.apple.com', 'apple.com'],
    selectedVariant: 'Apple knowledge-graph logo mark (PNG)',
    status: 'PASS',
    notes: 'Official apple.com structured-data logo asset.',
  },
  AMD: {
    symbol: 'AMD',
    companyName: 'AMD',
    mode: 'automated-first-party',
    sourceName: 'amd',
    sourcePage: 'https://ir.amd.com/',
    sourceUrl:
      'https://d1io3yog0oux5.cloudfront.net/_064d5906a8eb4ebea4947921aef4b9b7/amd/files/theme/images/favicons/apple-touch-icon.png',
    download: { kind: 'direct' },
    allowedHosts: ['d1io3yog0oux5.cloudfront.net', 'ir.amd.com'],
    selectedVariant: 'AMD IR site apple-touch icon (180×180)',
    status: 'PASS',
    notes: 'Served from AMD investor-relations CDN (Q4/CloudFront for ir.amd.com).',
  },
  AMZN: {
    symbol: 'AMZN',
    companyName: 'Amazon',
    mode: 'automated-first-party',
    sourceName: 'amazon',
    sourcePage: 'https://press.aboutamazon.com/images-and-videos',
    sourceUrl:
      'https://assets.aboutamazon.com/35/e3/3d5f6ca8495583f0a21db2e4b0e4/amazon-news-logo-final-smaller.svg',
    download: { kind: 'direct' },
    allowedHosts: ['assets.aboutamazon.com', 'press.aboutamazon.com'],
    selectedVariant: 'Amazon News logo (SVG wordmark)',
    status: 'PASS',
    notes: 'Official About Amazon press asset CDN. Horizontal wordmark — aspect preserved on 512 canvas.',
  },
  ASML: {
    symbol: 'ASML',
    companyName: 'ASML Holding NV',
    mode: 'automated-first-party',
    sourceName: 'asml',
    sourcePage: 'https://www.asml.com/en',
    sourceUrl: 'https://www.asml.com/images/icons/asml-logo.svg',
    download: { kind: 'svg_symbol', symbolId: 'logo' },
    allowedHosts: ['www.asml.com', 'media.asml.com'],
    selectedVariant: 'ASML site icon sprite → logo symbol (official asml.com SVG)',
    status: 'PASS',
    notes:
      'Official asml.com icon sprite; pipeline unwraps <symbol id="logo"> into a standalone SVG for rasterization (wordmark).',
  },
  BABA: {
    symbol: 'BABA',
    companyName: 'Alibaba',
    mode: 'automated-first-party',
    sourceName: 'alibaba',
    sourcePage: 'https://www.alibabagroup.com/en-US/resource-logos',
    sourceUrl:
      'https://data.alibabagroup.com/ecms-files/886024452/296d05a1-c52a-4f5e-abf2-0d49d4c0d6b3.png',
    download: { kind: 'direct' },
    allowedHosts: ['data.alibabagroup.com', 'www.alibabagroup.com', 'static.alibabagroup.com'],
    selectedVariant: 'Alibaba Group logo English (media library PNG)',
    status: 'PASS',
    notes: 'Official Alibaba Group media resources logo. Editorial credit line applies on source page.',
  },
  COIN: {
    symbol: 'COIN',
    companyName: 'Coinbase',
    mode: 'automated-first-party',
    sourceName: 'coinbase',
    sourcePage: 'https://cds.coinbase.com/components/media/LogoMark/',
    sourceUrl:
      'https://raw.githubusercontent.com/coinbase/cds/master/packages/common/src/hooks/useLogo.ts',
    download: { kind: 'coinbase_cds_logo_mark', size: 32 },
    allowedHosts: ['raw.githubusercontent.com', 'github.com', 'cds.coinbase.com'],
    selectedVariant: 'Coinbase LogoMark path from official CDS repo (size 32)',
    status: 'PASS',
    notes:
      'coinbase.com/press is Cloudflare-gated. Logo path extracted at runtime from official coinbase/cds GitHub brand source.',
  },
  CRCL: {
    symbol: 'CRCL',
    companyName: 'Circle Internet Group',
    mode: 'automated-first-party',
    sourceName: 'circle',
    sourcePage: 'https://www.circle.com/pressroom#brandkit',
    sourceUrl:
      'https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Pressroom/brandkit/logo-downloads/circle-logo-2024.zip',
    download: {
      kind: 'zip_member',
      packageUrl:
        'https://6778953.fs1.hubspotusercontent-na1.net/hubfs/6778953/Pressroom/brandkit/logo-downloads/circle-logo-2024.zip',
      memberPath: 'circle-logo/icon png/circle-icon.png',
    },
    allowedHosts: ['6778953.fs1.hubspotusercontent-na1.net', 'www.circle.com'],
    selectedVariant: 'Circle icon PNG from official 2024 brand ZIP',
    status: 'PASS',
    notes: 'Official Circle pressroom brand kit hosted on Circle HubSpot.',
  },
  GME: {
    symbol: 'GME',
    companyName: 'GameStop',
    mode: 'manual-storage',
    sourceName: 'gamestop',
    // Human must set via SCOOP_MANUAL_LOGO_SOURCE_PAGES or registry overlay before SQL.
    sourcePage: null,
    sourceUrl: null,
    download: null,
    allowedHosts: ['investor.gamestop.com', 'news.gamestop.com', 'www.gamestop.com'],
    selectedVariant: null,
    status: 'MANUAL_STORAGE',
    manualOfficialUpload: true,
    storagePath: `${CHAIN_ID}/gme.png`,
    notes:
      'Automated fetch blocked (HTTP 403). Manual official first-party PNG upload to quote-assets/4663/gme.png required.',
  },
  GOOGL: {
    symbol: 'GOOGL',
    companyName: 'Alphabet Class A / Google',
    mode: 'automated-first-party',
    sourceName: 'google',
    sourcePage: 'https://about.google/brand-resource-center/',
    sourceUrl: 'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png',
    download: { kind: 'direct' },
    allowedHosts: ['www.gstatic.com', 'www.google.com', 'about.google', 'partnermarketinghub.withgoogle.com'],
    selectedVariant: 'Google “G” product mark (not Alphabet wordmark)',
    status: 'PASS',
    notes:
      'Product decision: use Google G for ticker GOOGL recognizability. Official gstatic branding asset (96×96 @2x).',
  },
  INTC: {
    symbol: 'INTC',
    companyName: 'Intel',
    mode: 'automated-first-party',
    sourceName: 'intel',
    sourcePage: 'https://www.intc.com/',
    sourceUrl:
      'https://d1io3yog0oux5.cloudfront.net/_88b01b330621eb4afbd070d5caa4f035/intel/files/theme/images/header-logo.svg',
    download: { kind: 'direct' },
    allowedHosts: ['d1io3yog0oux5.cloudfront.net', 'www.intc.com'],
    selectedVariant: 'Intel IR header logo (SVG wordmark)',
    status: 'PASS',
    notes: 'Official Intel investor site (intc.com) theme logo on IR CDN.',
  },
  META: {
    symbol: 'META',
    companyName: 'Meta Platforms',
    mode: 'automated-first-party',
    sourceName: 'meta',
    sourcePage: 'https://about.meta.com/brand/resources/',
    sourceUrl: 'https://static.xx.fbcdn.net/rsrc.php/yf/r/-7pQO6hUGK_.svg',
    download: { kind: 'direct' },
    allowedHosts: ['static.xx.fbcdn.net', 'about.meta.com', 'www.meta.com'],
    selectedVariant: 'Meta brand SVG served from Meta/Facebook CDN',
    status: 'PASS',
    notes: 'about.meta.com brand resources page references Meta CDN assets; selected infinity-style mark SVG.',
  },
  MSFT: {
    symbol: 'MSFT',
    companyName: 'Microsoft',
    mode: 'automated-first-party',
    sourceName: 'microsoft',
    sourcePage: 'https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks',
    sourceUrl:
      'https://www.microsoft.com/content/dam/microsoft/final/en-us/microsoft-brand/logo/MSFT-Microsoft-sticky-logo-RE1Mu3b.png?ver=5c31',
    download: { kind: 'direct' },
    allowedHosts: ['www.microsoft.com', 'img-prod-cms-rt-microsoft-com.akamaized.net'],
    selectedVariant: 'Microsoft sticky brand logo PNG',
    status: 'PASS',
    notes: 'Official microsoft.com brand DAM asset.',
  },
  MSTR: {
    symbol: 'MSTR',
    companyName: 'Strategy Inc.',
    mode: 'manual-storage',
    sourceName: 'strategy',
    sourcePage: null,
    sourceUrl: null,
    download: null,
    allowedHosts: ['www.strategy.com', 'www.microstrategy.com'],
    selectedVariant: null,
    status: 'MANUAL_STORAGE',
    manualOfficialUpload: true,
    storagePath: `${CHAIN_ID}/mstr.png`,
    notes:
      'Automated fetch blocked (HTTP 403). Manual official Strategy branding PNG upload to quote-assets/4663/mstr.png required.',
  },
  MU: {
    symbol: 'MU',
    companyName: 'Micron Technology',
    mode: 'automated-first-party',
    sourceName: 'micron',
    sourcePage: 'https://www.micron.com/',
    sourceUrl:
      'https://www.micron.com/content/dam/micron/connectedassets/micron/global/imported-images/icons/logos/micron-logo-black.png',
    download: { kind: 'direct' },
    allowedHosts: ['www.micron.com', 'assets.micron.com'],
    selectedVariant: 'Micron logo black PNG',
    status: 'PASS',
    notes: 'Official micron.com content DAM logo.',
  },
  NVDA: {
    symbol: 'NVDA',
    companyName: 'NVIDIA',
    mode: 'automated-first-party',
    sourceName: 'nvidia',
    sourcePage: 'https://www.nvidia.com/en-us/about-nvidia/legal-info/logo-brand-usage/',
    sourceUrl:
      'https://www.nvidia.com/content/dam/en-zz/Solutions/about-nvidia/logo-and-brand/01-nvidia-logo-vert-500x200-2c50-p.png',
    download: { kind: 'direct' },
    allowedHosts: ['www.nvidia.com', 'images.nvidia.com', 'design.nvidia.com'],
    selectedVariant: 'NVIDIA vertical logo (official logo-and-brand DAM)',
    status: 'PASS',
    notes: 'From NVIDIA logo & brand usage page asset library.',
  },
  PLTR: {
    symbol: 'PLTR',
    companyName: 'Palantir Technologies',
    mode: 'automated-first-party',
    sourceName: 'palantir',
    sourcePage: 'https://www.palantir.com/newsroom/',
    sourceUrl:
      'https://www.palantir.com/assets/xrfr7uokpv1b/2oMYTv79K8RVqztNorVdFR/baf49c4d3037028074ec71e56767f01f/Palantir_Chevron.png',
    download: { kind: 'direct' },
    allowedHosts: ['www.palantir.com'],
    selectedVariant: 'Palantir Chevron mark PNG',
    status: 'PASS',
    notes: 'Official palantir.com newsroom/site asset.',
  },
  SNDK: {
    symbol: 'SNDK',
    companyName: 'Sandisk Corporation',
    mode: 'manual-storage',
    sourceName: 'sandisk',
    sourcePage: null,
    sourceUrl: null,
    download: null,
    allowedHosts: ['www.sandisk.com', 'investor.sandisk.com'],
    selectedVariant: null,
    status: 'MANUAL_STORAGE',
    manualOfficialUpload: true,
    storagePath: `${CHAIN_ID}/sndk.png`,
    notes:
      'No automated first-party URL. Manual official Sandisk PNG upload to quote-assets/4663/sndk.png required.',
  },
  SPCX: {
    symbol: 'SPCX',
    companyName: 'Space Exploration Technologies Corp.',
    mode: 'automated-first-party',
    sourceName: 'spacex',
    sourcePage: 'https://ir.spacex.com/',
    sourceUrl: 'https://s21.q4cdn.com/184289198/files/design/site_logo/logo-3.svg',
    download: { kind: 'direct' },
    allowedHosts: ['s21.q4cdn.com', 'ir.spacex.com', 'www.spacex.com', 'shop.spacex.com'],
    selectedVariant: 'SpaceX IR site logo SVG',
    status: 'PASS',
    notes:
      'Official SpaceX investor-relations logo on Q4 CDN for ir.spacex.com. Trademark page restricts endorsement uses — product display should remain non-endorsement.',
  },
  TSLA: {
    symbol: 'TSLA',
    companyName: 'Tesla',
    mode: 'automated-first-party',
    sourceName: 'tesla',
    sourcePage: 'https://www.tesla.com/',
    sourceUrl:
      'https://www.tesla.com/sites/all/themes/custom/tesla_theme/assets/img/icons/favicon-196x196.png',
    download: { kind: 'direct' },
    allowedHosts: ['www.tesla.com', 'digitalassets.tesla.com'],
    selectedVariant: 'tesla.com favicon-196 (official Tesla-controlled raster)',
    status: 'PASS',
    reviewDecision: 'approved',
    reviewReason: 'Official Tesla-controlled favicon accepted for quote selector UI',
    notes:
      'Accepted: official Tesla-controlled favicon-196 normalized to 512×512. Higher-res brand kit remains unreachable via automated fetch.',
  },
  TSM: {
    symbol: 'TSM',
    companyName: 'Taiwan Semiconductor Manufacturing',
    mode: 'manual-storage',
    sourceName: 'tsmc',
    sourcePage: null,
    sourceUrl: null,
    download: null,
    allowedHosts: ['www.tsmc.com', 'investor.tsmc.com'],
    selectedVariant: null,
    status: 'MANUAL_STORAGE',
    manualOfficialUpload: true,
    storagePath: `${CHAIN_ID}/tsm.png`,
    notes:
      'Automated fetch blocked (HTTP 403). Manual official TSMC PNG upload to quote-assets/4663/tsm.png required.',
  },
};

export function assertRegistryComplete() {
  for (const symbol of CANONICAL_STOCK_SYMBOLS) {
    if (!STOCK_LOGO_REGISTRY[symbol]) {
      throw new Error(`Missing stock logo registry entry for ${symbol}`);
    }
  }
  const extras = Object.keys(STOCK_LOGO_REGISTRY).filter(
    (s) => !CANONICAL_STOCK_SYMBOLS.includes(s),
  );
  if (extras.length) throw new Error(`Unexpected registry symbols: ${extras.join(', ')}`);

  const manuals = CANONICAL_STOCK_SYMBOLS.filter(
    (s) => STOCK_LOGO_REGISTRY[s].mode === 'manual-storage',
  );
  if (manuals.length !== MANUAL_STORAGE_SYMBOLS.length) {
    throw new Error(
      `Expected ${MANUAL_STORAGE_SYMBOLS.length} manual-storage symbols, got ${manuals.join(',')}`,
    );
  }
  for (const s of MANUAL_STORAGE_SYMBOLS) {
    if (STOCK_LOGO_REGISTRY[s].mode !== 'manual-storage') {
      throw new Error(`${s} must be mode=manual-storage`);
    }
  }
}

export function getAutomatedStockSymbols() {
  return CANONICAL_STOCK_SYMBOLS.filter(
    (s) => STOCK_LOGO_REGISTRY[s].mode === 'automated-first-party',
  );
}

export function getRegistryStatuses() {
  assertRegistryComplete();
  return CANONICAL_STOCK_SYMBOLS.map((symbol) => {
    const e = STOCK_LOGO_REGISTRY[symbol];
    return {
      symbol,
      mode: e.mode,
      status: e.status,
      sourceName: e.sourceName,
      host: e.allowedHosts?.[0] ?? null,
      storagePath: e.storagePath ?? null,
    };
  });
}

export function isManualStorageEntry(entryOrSymbol) {
  if (typeof entryOrSymbol === 'string') {
    return STOCK_LOGO_REGISTRY[entryOrSymbol]?.mode === 'manual-storage';
  }
  return entryOrSymbol?.mode === 'manual-storage';
}
