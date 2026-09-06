#!/usr/bin/env node
/**
 * Phase 6B.1 — read-only Tiingo News inspector.
 *
 * Usage (from repo root):
 *   node --env-file=.env.local scripts/inspect-tiingo-news.mjs
 *
 * - Calls ONLY https://api.tiingo.com/tiingo/news
 * - Never calls /tiingo/news/bulk_download
 * - Never prints the API token
 * - No DB writes / no permanent poller
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ENDPOINT = 'https://api.tiingo.com/tiingo/news';
const FORBIDDEN = 'https://api.tiingo.com/tiingo/news/bulk_download';

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function assertSafeUrl(url) {
  if (url.includes('bulk_download') || url.startsWith(FORBIDDEN)) {
    throw new Error('Refusing to call bulk_download endpoint');
  }
}

function redactToken(value) {
  if (!value) return value;
  return '[REDACTED]';
}

function normalizeDomain(source) {
  if (!source || typeof source !== 'string') return null;
  let s = source.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/\/.*$/, '');
  if (s.startsWith('www.')) s = s.slice(4);
  return s || null;
}

function fieldStats(articles) {
  const keys = new Set();
  for (const a of articles) Object.keys(a ?? {}).forEach((k) => keys.add(k));
  const coverage = {};
  for (const k of [...keys].sort()) {
    let present = 0;
    let empty = 0;
    let nullish = 0;
    for (const a of articles) {
      const v = a?.[k];
      if (v == null) nullish += 1;
      else if (Array.isArray(v) && v.length === 0) empty += 1;
      else if (typeof v === 'string' && v.trim() === '') empty += 1;
      else present += 1;
    }
    coverage[k] = { present, empty, nullish };
  }
  return { keys: [...keys].sort(), coverage };
}

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

async function tiingoGet(token, query) {
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  assertSafeUrl(url.toString());

  const started = Date.now();
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`,
    },
  });
  const elapsedMs = Date.now() - started;
  const headerObj = {};
  res.headers.forEach((v, k) => {
    headerObj[k] = v;
  });
  const rateHeaders = Object.fromEntries(
    Object.entries(headerObj).filter(([k]) =>
      /rate|limit|retry|remaining|quota|x-/i.test(k),
    ),
  );

  let body;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = { parseError: true, textPreview: text.slice(0, 200) };
  }

  return {
    status: res.status,
    ok: res.ok,
    elapsedMs,
    requestQuery: { ...query },
    rateHeaders,
    interestingHeaders: {
      'content-type': headerObj['content-type'],
      date: headerObj['date'],
      server: headerObj['server'],
      'cache-control': headerObj['cache-control'],
    },
    body,
  };
}

function analyzeSample(articles, label) {
  const ids = articles.map((a) => a?.id);
  const urls = articles.map((a) => a?.url);
  const titles = articles.map((a) => a?.title);
  const uniqueIds = new Set(ids.filter((x) => x != null).map(String));
  const uniqueUrls = new Set(urls.filter(Boolean));
  const uniqueTitles = new Set(titles.filter(Boolean));

  const withTickers = articles.filter(
    (a) => Array.isArray(a?.tickers) && a.tickers.length > 0,
  );
  const withTags = articles.filter(
    (a) => Array.isArray(a?.tags) && a.tags.length > 0,
  );
  const tickerCounts = withTickers.map((a) => a.tickers.length);
  const allTickers = withTickers.flatMap((a) => a.tickers);
  const casing = {
    upper: allTickers.filter((t) => t === String(t).toUpperCase()).length,
    lower: allTickers.filter((t) => t === String(t).toLowerCase()).length,
    mixed: allTickers.filter(
      (t) => t !== String(t).toUpperCase() && t !== String(t).toLowerCase(),
    ).length,
  };
  const suspiciousTickers = [...new Set(allTickers)].filter(
    (t) =>
      typeof t !== 'string' ||
      t.length === 0 ||
      t.length > 12 ||
      /[^A-Za-z0-9.\-:]/.test(t),
  );

  const allTags = withTags.flatMap((a) => a.tags);
  const tagFreq = {};
  for (const t of allTags) tagFreq[t] = (tagFreq[t] ?? 0) + 1;
  const topTags = Object.entries(tagFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  const sources = articles.map((a) => a?.source).filter(Boolean);
  const domains = sources.map(normalizeDomain).filter(Boolean);
  const uniqueSources = new Set(sources);
  const uniqueDomains = new Set(domains);

  const descLens = articles
    .map((a) => (typeof a?.description === 'string' ? a.description.length : 0))
    .filter((n) => n >= 0);
  const descStats =
    descLens.length === 0
      ? null
      : {
          min: Math.min(...descLens),
          max: Math.max(...descLens),
          avg: Math.round(descLens.reduce((s, n) => s + n, 0) / descLens.length),
          emptyOrMissing: articles.filter(
            (a) => !a?.description || String(a.description).trim() === '',
          ).length,
        };

  const crawl = articles.map((a) => parseDate(a?.crawlDate)).filter((x) => x != null);
  const pub = articles.map((a) => parseDate(a?.publishedDate)).filter((x) => x != null);
  const gaps = articles
    .map((a) => {
      const c = parseDate(a?.crawlDate);
      const p = parseDate(a?.publishedDate);
      if (c == null || p == null) return null;
      return Math.round((c - p) / 1000);
    })
    .filter((x) => x != null);

  const imageishKeys = new Set();
  for (const a of articles) {
    for (const k of Object.keys(a ?? {})) {
      if (/image|img|thumb|photo|media|enclosure/i.test(k)) imageishKeys.add(k);
    }
  }

  const orderedByCrawl = [...articles].every((a, i, arr) => {
    if (i === 0) return true;
    const prev = parseDate(arr[i - 1]?.crawlDate);
    const cur = parseDate(a?.crawlDate);
    if (prev == null || cur == null) return true;
    return prev >= cur; // expect desc when sortBy=crawlDate
  });

  return {
    label,
    count: articles.length,
    fieldStats: fieldStats(articles),
    duplicates: {
      duplicateIds: ids.length - uniqueIds.size,
      duplicateUrls: urls.filter(Boolean).length - uniqueUrls.size,
      duplicateTitles: titles.filter(Boolean).length - uniqueTitles.size,
    },
    tickers: {
      pctWithAtLeastOne: articles.length
        ? Number(((withTickers.length / articles.length) * 100).toFixed(1))
        : 0,
      countDistribution: {
        min: tickerCounts.length ? Math.min(...tickerCounts) : 0,
        max: tickerCounts.length ? Math.max(...tickerCounts) : 0,
        avg: tickerCounts.length
          ? Number(
              (
                tickerCounts.reduce((s, n) => s + n, 0) / tickerCounts.length
              ).toFixed(2),
            )
          : 0,
      },
      casing,
      suspiciousTickers: suspiciousTickers.slice(0, 20),
      sample: [...new Set(allTickers)].slice(0, 25),
    },
    tags: {
      pctWithAtLeastOne: articles.length
        ? Number(((withTags.length / articles.length) * 100).toFixed(1))
        : 0,
      uniqueTagCount: new Set(allTags).size,
      topTags,
    },
    sources: {
      uniqueSourceStrings: uniqueSources.size,
      uniqueNormalizedDomains: uniqueDomains.size,
      sampleSources: [...uniqueSources].slice(0, 20),
      sampleDomains: [...uniqueDomains].slice(0, 20),
    },
    descriptionLength: descStats,
    freshness: {
      newestCrawlDate: crawl.length
        ? new Date(Math.max(...crawl)).toISOString()
        : null,
      oldestCrawlDate: crawl.length
        ? new Date(Math.min(...crawl)).toISOString()
        : null,
      newestPublishedDate: pub.length
        ? new Date(Math.max(...pub)).toISOString()
        : null,
      oldestPublishedDate: pub.length
        ? new Date(Math.min(...pub)).toISOString()
        : null,
      crawlMinusPublishedSeconds: gaps.length
        ? {
            min: Math.min(...gaps),
            max: Math.max(...gaps),
            avg: Math.round(gaps.reduce((s, n) => s + n, 0) / gaps.length),
            negativeCount: gaps.filter((g) => g < 0).length,
          }
        : null,
      orderedNewestCrawlFirst: orderedByCrawl,
    },
    imageFieldsObserved: [...imageishKeys],
    sampleArticlesSanitized: articles.slice(0, 3).map((a) => ({
      id: a?.id,
      title: a?.title ? String(a.title).slice(0, 120) : null,
      source: a?.source,
      sourceDomain: normalizeDomain(a?.source),
      urlHost: (() => {
        try {
          return new URL(a.url).host;
        } catch {
          return null;
        }
      })(),
      publishedDate: a?.publishedDate,
      crawlDate: a?.crawlDate,
      tickerCount: Array.isArray(a?.tickers) ? a.tickers.length : 0,
      tagCount: Array.isArray(a?.tags) ? a.tags.length : 0,
      descriptionLen:
        typeof a?.description === 'string' ? a.description.length : 0,
      keys: Object.keys(a ?? {}).sort(),
    })),
  };
}

async function main() {
  loadEnvLocal();
  const token = process.env.TIINGO_API_TOKEN?.trim();
  if (!token) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'TIINGO_API_TOKEN missing — set in .env.local',
      }),
    );
    process.exitCode = 1;
    return;
  }

  const report = {
    phase: '6B.1',
    endpoint: ENDPOINT,
    bulkEndpointCalled: false,
    auth: 'Authorization: Token <redacted>',
    tokenPresent: true,
    tokenLengthChars: token.length,
    probes: [],
  };

  // Probe 1: latest sample
  const latest = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 25,
  });
  const latestArticles = Array.isArray(latest.body) ? latest.body : [];
  report.probes.push({
    name: 'latest_sortBy_crawlDate_limit_25',
    status: latest.status,
    ok: latest.ok,
    elapsedMs: latest.elapsedMs,
    rateHeaders: latest.rateHeaders,
    interestingHeaders: latest.interestingHeaders,
    returnedCount: latestArticles.length,
    analysis: analyzeSample(latestArticles, 'latest'),
  });

  // Probe 2: tickers filter
  const byTicker = await tiingoGet(token, {
    sortBy: 'crawlDate',
    tickers: 'AAPL',
    limit: 10,
  });
  const tickerArticles = Array.isArray(byTicker.body) ? byTicker.body : [];
  report.probes.push({
    name: 'tickers_AAPL_limit_10',
    status: byTicker.status,
    ok: byTicker.ok,
    elapsedMs: byTicker.elapsedMs,
    rateHeaders: byTicker.rateHeaders,
    returnedCount: tickerArticles.length,
    allContainAapl: tickerArticles.every(
      (a) =>
        Array.isArray(a?.tickers) &&
        a.tickers.map((t) => String(t).toUpperCase()).includes('AAPL'),
    ),
    analysis: analyzeSample(tickerArticles, 'tickers=AAPL'),
  });

  // Probe 3: pagination overlap
  const page1 = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 5,
    offset: 0,
  });
  const page2 = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 5,
    offset: 5,
  });
  const p1 = Array.isArray(page1.body) ? page1.body : [];
  const p2 = Array.isArray(page2.body) ? page2.body : [];
  const ids1 = new Set(p1.map((a) => String(a?.id)));
  const overlap = p2.filter((a) => ids1.has(String(a?.id))).map((a) => a?.id);
  report.probes.push({
    name: 'pagination_limit5_offset0_then_5',
    page1: { status: page1.status, count: p1.length, ids: [...ids1] },
    page2: {
      status: page2.status,
      count: p2.length,
      ids: p2.map((a) => a?.id),
    },
    overlapIds: overlap,
    idLooksStableNumeric: [...ids1, ...p2.map((a) => a?.id)].every(
      (id) => typeof id === 'number' || /^\d+$/.test(String(id)),
    ),
  });

  // Probe 4: startDate/endDate (if accepted)
  const end = new Date();
  const start = new Date(Date.now() - 2 * 24 * 3600 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const dated = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 10,
    startDate: fmt(start),
    endDate: fmt(end),
  });
  report.probes.push({
    name: 'startDate_endDate_2d_window',
    status: dated.status,
    ok: dated.ok,
    elapsedMs: dated.elapsedMs,
    query: { startDate: fmt(start), endDate: fmt(end), limit: 10 },
    returnedCount: Array.isArray(dated.body) ? dated.body.length : null,
    errorBody: dated.ok
      ? null
      : typeof dated.body === 'object'
        ? dated.body
        : String(dated.body).slice(0, 200),
  });

  // Probe 5: tags / onlyWithTickers / source (best-effort)
  const tagged = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 5,
    tags: 'earnings',
  });
  report.probes.push({
    name: 'tags_earnings_limit_5',
    status: tagged.status,
    ok: tagged.ok,
    returnedCount: Array.isArray(tagged.body) ? tagged.body.length : null,
    errorPreview: tagged.ok
      ? null
      : JSON.stringify(tagged.body).slice(0, 200),
  });

  const onlyTickers = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 10,
    onlyWithTickers: 'true',
  });
  const onlyArticles = Array.isArray(onlyTickers.body) ? onlyTickers.body : [];
  report.probes.push({
    name: 'onlyWithTickers_true_limit_10',
    status: onlyTickers.status,
    ok: onlyTickers.ok,
    returnedCount: onlyArticles.length,
    allHaveTickers: onlyArticles.every(
      (a) => Array.isArray(a?.tickers) && a.tickers.length > 0,
    ),
    errorPreview: onlyTickers.ok
      ? null
      : JSON.stringify(onlyTickers.body).slice(0, 200),
  });

  const sourced = await tiingoGet(token, {
    sortBy: 'crawlDate',
    limit: 5,
    source: 'reuters.com',
  });
  report.probes.push({
    name: 'source_reuters.com_limit_5',
    status: sourced.status,
    ok: sourced.ok,
    returnedCount: Array.isArray(sourced.body) ? sourced.body.length : null,
    errorPreview: sourced.ok
      ? null
      : JSON.stringify(sourced.body).slice(0, 200),
  });

  // Safety: never include token in output
  const json = JSON.stringify(report, null, 2);
  if (json.includes(token)) {
    throw new Error('Refusing to print report — token leaked into JSON');
  }
  console.log(json);
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      note: 'token redacted',
      token: redactToken('x'),
    }),
  );
  process.exitCode = 1;
});
