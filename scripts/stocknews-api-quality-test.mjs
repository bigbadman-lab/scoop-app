/**
 * DIAGNOSTIC ONLY — Stock News API quality experiment (Phase D.2-test)
 * Read-only. No DB writes. Do not use in production ingestion.
 *
 * Observed trial constraint: items <= 3 per request.
 *
 * Usage: node scripts/stocknews-api-quality-test.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://stocknewsapi.com/api/v1';
/** Trial plan hard limit observed live. */
const MAX_ITEMS = 3;

function loadToken() {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) throw new Error('.env.local missing');
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('STOCK_NEWS_API_TOKEN=')) continue;
    let v = line.slice('STOCK_NEWS_API_TOKEN='.length).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!v) throw new Error('STOCK_NEWS_API_TOKEN empty');
    return v;
  }
  throw new Error('STOCK_NEWS_API_TOKEN not found');
}

function redact(err) {
  return String(err)
    .replace(/token=[^&\s"']+/gi, 'token=[REDACTED]')
    .replace(/`[^`]{16,}`/g, '`[REDACTED]`');
}

async function apiGet(pathAndQuery, token) {
  const url = new URL(`${BASE}${pathAndQuery}`);
  url.searchParams.set('token', token);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const msg = redact(body?.message ?? res.statusText);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return body;
}

function gradeHeadline(title, text = '') {
  const t = `${title}\n${text}`;

  if (
    /\b(nba|nfl|mlb|nhl|champions league|soccer|celebrity|lifestyle|recipe|dating|horoscope|girl scout|realtor|pickup truck|street fighter|rpg\b|box office|movie review|memecoin|how to invest|budgeting tips)\b/i.test(
      t,
    )
  ) {
    return 'D';
  }

  if (
    /\b(earnings|eps\b|guidance|outlook|revenue|upgrade|downgrade|price target|merger|acquisition|acquire|m&a\b|takeover|sec\b|lawsuit|settlement|class action|ceo\b|cfo\b|appoints|resigns|dividend|buyback|ipo\b|bankruptcy|layoff|restructuring|fda\b|clinical|tariff|climbs? \d|jumps? \d|falls? \d|surges? \d|raises? \$?\d|capital raise|share repurchase|foldable|beats estimates|misses estimates)\b/i.test(
      t,
    )
  ) {
    return 'A';
  }

  if (
    /\b(federal reserve|fomc\b|interest rate|rate cut|rate hike|inflation|cpi\b|jobs report|s&p 500|nasdaq composite|stock market|wall street|export control|trade war|oil shock|crude oil|opec)\b/i.test(
      t,
    )
  ) {
    return 'B';
  }

  return 'C';
}

function isLikelyNoiseSymbol(ticker, name = '') {
  const t = ticker.toUpperCase();
  const n = String(name).toLowerCase();
  if (/\betf\b|fund,?\s*lp|ultra |proshares|ishares|spdr|vaneck|invesco/.test(n)) {
    return 'etf_fund';
  }
  if (['USD', 'USO', 'UCO', 'VIX', 'BTC', 'ETH'].includes(t)) return 'commodity_or_macro_proxy';
  return null;
}

async function main() {
  const token = loadToken();
  const calls = [];
  const dateWindow = 'today';

  calls.push(`GET /api/v1/top-mention?date=${dateWindow}`);
  const mentionJson = await apiGet(`/top-mention?date=${dateWindow}`, token);
  const mentionRows = Array.isArray(mentionJson?.data?.all)
    ? mentionJson.data.all
    : Array.isArray(mentionJson?.data)
      ? mentionJson.data
      : [];
  if (mentionRows.length === 0) {
    throw new Error('empty top-mention data.all');
  }

  const top50 = mentionRows.slice(0, 50).map((row, idx) => ({
    rank: idx + 1,
    ticker: String(row.ticker ?? '').toUpperCase(),
    name: row.name ?? null,
    total_mentions: row.total_mentions ?? null,
    positive_mentions: row.positive_mentions ?? null,
    negative_mentions: row.negative_mentions ?? null,
    neutral_mentions: row.neutral_mentions ?? null,
    sentiment_score: row.sentiment_score ?? null,
    noise: isLikelyNoiseSymbol(String(row.ticker ?? ''), row.name ?? ''),
  }));

  const tickerList = top50.map((t) => t.ticker).filter(Boolean);

  // Trial: max items=3. Batch ~3 tickers per call to stay efficient.
  const articles = [];
  const seen = new Set();
  let dupesRemoved = 0;
  const chunkSize = 3;
  for (let i = 0; i < tickerList.length; i += chunkSize) {
    if (articles.length >= 100) break;
    const chunk = tickerList.slice(i, i + chunkSize);
    const q = new URLSearchParams({
      tickers: chunk.join(','),
      items: String(MAX_ITEMS),
      page: '1',
      type: 'article',
      date: dateWindow,
    });
    calls.push(
      `GET /api/v1?tickers=${chunk.length}_symbols&items=${MAX_ITEMS}&type=article&date=${dateWindow}`,
    );
    const body = await apiGet(`?${q.toString()}`, token);
    const rows = Array.isArray(body?.data) ? body.data : [];
    for (const row of rows) {
      const key = String(row.news_url ?? row.news_id ?? `${row.title}|${row.date}`);
      if (seen.has(key)) {
        dupesRemoved += 1;
        continue;
      }
      seen.add(key);
      articles.push(row);
      if (articles.length >= 100) break;
    }
  }

  articles.sort((a, b) => Date.parse(b.date ?? 0) - Date.parse(a.date ?? 0));
  const sample = articles.slice(0, 100);

  const grades = { A: 0, B: 0, C: 0, D: 0 };
  const graded = sample.map((row, idx) => {
    const title = String(row.title ?? '');
    const text = String(row.text ?? '');
    const g = gradeHeadline(title, text);
    grades[g] += 1;
    const tickersField = row.tickers ?? [];
    const tickerStr = Array.isArray(tickersField)
      ? tickersField.join(',')
      : String(tickersField);
    return {
      n: idx + 1,
      grade: g,
      tickers: tickerStr,
      source: row.source_name ?? '',
      published_at: row.date ?? '',
      headline: title.slice(0, 140),
      rank: row.rank_score ?? null,
      type: row.type ?? null,
      sentiment: row.sentiment ?? null,
      topics: row.topics ?? null,
      has_news_url: Boolean(row.news_url),
      has_image_url: Boolean(row.image_url),
      field_keys: idx === 0 ? Object.keys(row) : undefined,
    };
  });

  const n = sample.length || 1;
  const pct = (c) => Math.round((c / Math.max(sample.length, 1)) * 1000) / 10;

  const times = sample
    .map((r) => Date.parse(r.date ?? ''))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  const newest = times.length ? new Date(times[times.length - 1]).toISOString() : null;
  const oldest = times.length ? new Date(times[0]).toISOString() : null;
  const median = times.length
    ? new Date(times[Math.floor(times.length / 2)]).toISOString()
    : null;
  const now = Date.now();
  const agesMin = times.map((t) => (now - t) / 60000);
  const medianAgeMin =
    agesMin.length > 0 ? Math.round(agesMin[Math.floor(agesMin.length / 2)]) : null;

  const sourceCounts = {};
  for (const row of sample) {
    const s = String(row.source_name ?? 'unknown');
    sourceCounts[s] = (sourceCounts[s] ?? 0) + 1;
  }
  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  let scoopFilter = null;
  try {
    const { evaluateScoopNewsRelevance } = await import(
      '../packages/news/dist/relevance.js'
    );
    let accepted = 0;
    let rejected = 0;
    const reasonCounts = {};
    for (const row of sample) {
      const tickersArr = Array.isArray(row.tickers)
        ? row.tickers
        : String(row.tickers ?? '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
      const r = evaluateScoopNewsRelevance({
        title: String(row.title ?? ''),
        description: String(row.text ?? ''),
        tickers: tickersArr,
        sourceDomain: String(row.source_name ?? ''),
      });
      if (r.accepted) accepted += 1;
      else {
        rejected += 1;
        const key = r.reasons[0] ?? 'rejected';
        reasonCounts[key] = (reasonCounts[key] ?? 0) + 1;
      }
    }
    scoopFilter = {
      accepted,
      rejected,
      accept_pct: pct(accepted),
      top_reject_reasons: reasonCounts,
    };
  } catch (error) {
    scoopFilter = { error: redact(error) };
  }

  const noiseInTop50 = top50.filter((t) => t.noise).length;

  console.log(
    JSON.stringify(
      {
        config: {
          date_window: dateWindow,
          top_mention_endpoint: 'GET /api/v1/top-mention',
          article_endpoint: 'GET /api/v1 (tickers CSV, type=article)',
          plan_constraint: `trial items<=${MAX_ITEMS} (observed)`,
          calls_used: calls.length,
          call_shapes: calls,
          sample_size: sample.length,
          mention_total_returned: mentionRows.length,
          duplicates_removed: dupesRemoved,
          cache: 'default top-mention cache (no cache=false)',
        },
        mention_item_keys: Object.keys(mentionRows[0] ?? {}),
        top20_tickers: top50.slice(0, 20),
        top50_noise_count: noiseInTop50,
        top50_tickers: top50.map((t) => t.ticker),
        raw_quality: {
          A: grades.A,
          B: grades.B,
          C: grades.C,
          D: grades.D,
          A_pct: pct(grades.A),
          B_pct: pct(grades.B),
          C_pct: pct(grades.C),
          D_pct: pct(grades.D),
          AB_pct: pct(grades.A + grades.B),
        },
        freshness: {
          newest,
          oldest,
          median_published: median,
          median_age_minutes: medianAgeMin,
          timezone_note: 'Provider docs: Eastern Time on timestamps',
        },
        top_sources: topSources,
        article_field_keys: graded[0]?.field_keys ?? [],
        scoop_filter: scoopFilter,
        top30: graded.slice(0, 30).map(({ field_keys, ...rest }) => rest),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ level: 'error', error: redact(error) }));
  process.exitCode = 1;
});
