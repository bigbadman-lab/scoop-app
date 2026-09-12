/**
 * SCOOP Markets relevance policy for Stock News API `section=general`.
 * Deterministic — no LLM. Distinct from Stocks equity relevance.
 *
 * Core rule (N4B): market impact > ticker presence.
 * Tickers are never required. Single-name stock-pick opinion is rejected.
 */

import type { ScoopNewsRelevanceClass } from './relevance.js';

export type MarketsRelevanceClass = ScoopNewsRelevanceClass;

export type MarketsRelevance = {
  accepted: boolean;
  score: number;
  reasons: string[];
  relevanceClass: MarketsRelevanceClass;
  /** Editorial bucket for dry-run / ops (not a DB enum). */
  editorialBucket: string | null;
};

const PERSONAL_FINANCE_RE =
  /\b(how to invest|best credit card|refinance your|mortgage tips|budgeting tips|retirement calculator|save for college|girl scouts?|cookie season|weight loss|dating|horoscope|crossword|sudoku|recipe|lifestyle|job interview|r[eé]sum[eé]|social security.?s cola)\b/i;

const LIFESTYLE_RE =
  /\b(celebrity|fashion week|theme park|disney world|box office|movie review|film review|emmy|grammy|oscar|streaming series|cast(ing)? news)\b/i;

const STOCK_PICK_OPINION_RE =
  /\b(should you buy|time to buy|buy the dip|stocks? to (?:buy|hold|watch)|hold forever|\d+\s+stocks?\b|reasons to (?:like|buy)|i'?m a buyer|reasons why i'?m a buyer|smarter bet|forget \w+:|trending stock|facts to know before|here is what you need to know|worth \$\d[\d.,]* trillion|next big catalyst for the stock|outpaces its industry|coiled spring|my target was hit|deserves one last chance|this was the turning point|most important ai picks?|investors heavily search|prediction:\s*owning \d+ shares|will turn \$\d[\d.,]* into|a \$\d[\d.,]* investment a year ago)\b/i;

const GENERIC_INVESTING_EDU_RE =
  /\b(what is (?:an? )?(?:etf|stock|bond|index)|investing 101|beginner.?s guide to|how the stock market works|dollar.?cost averaging tips|compound interest explained)\b/i;

const SINGLE_NAME_OPINION_RE =
  /\b(warrant(?:s)? a (?:risk )?capital bet|dusty corner that shines|next growth engine is already|financial outlook|beats stock market upswing|stock right now\?|where will .{1,40} be in \d+ years)\b/i;

/** Broad market / macro / policy / geopolitics with tape relevance. */
const FED_RATES_RE =
  /\b(federal reserve|the fed\b|fomc\b|powell\b|interest rates?|rate cut|rate hike|fed (?:hike|cut|hold|pivot|outlook)|fed funds|treasury yields?|bond yields?|yield curve|central bank|ecb\b|boj\b|bank of (?:england|japan)|monetary policy)\b/i;

const INFLATION_ECONOMY_RE =
  /\b(inflation|cpi\b|ppi\b|pce\b|consumer prices?|jobs report|nonfarm|payrolls?|unemployment|gdp\b|economic growth|recession|soft landing|hard landing|consumer (?:spending|sentiment)|retail sales|budget deficit|fiscal (?:year|deficit|policy)|cbo reports?)\b/i;

const OIL_ENERGY_RE =
  /\b(oil (?:price|prices|shock|supply|spike|surge|slump|markets?|retreats?|flow|flows)|crude oil|brent\b|wti\b|opec\b|pipeline (?:attack|disruption|outage)|energy (?:shock|crisis|prices?)|gasoline prices?|natural gas prices?|falling oil|oil retreats?|iea says)\b/i;

const GEOPOLITICS_MARKET_RE =
  /\b(sanction(?:s|ed)?|tariff|trade war|trade restriction|export control|shipping (?:disruption|lane|strait)|strait of hormuz|red sea|geopolitic|war ending|military (?:strike|attack)|pipeline attack|mid.?east (?:conflict|tensions?)|iran (?:war|attack|oil|escalation)|u\.?s\.?-iran|saudi (?:pipeline|oil)|attack on saudi)\b/i;

const BROAD_MARKET_RE =
  /\b(s&p\s*500|s&p composite|nasdaq(?:\s*composite|\s*100|-100)?|dow jones|wall street|stock market|equity market|markets? this week|what moved markets|market (?:selloff|sell-off|rally|rout|plunge|surge|volatility|weakness)|risk[- ]on|risk[- ]off|futures (?:rise|fall|rally|slide)|vix\b)\b/i;

const BANKING_CREDIT_RE =
  /\b(banking (?:system|crisis|stress)|credit (?:crunch|markets?|stress)|liquidity (?:crunch|crisis|shock)|regional banks?|bank run|deposit flight|financial stability)\b/i;

const IPO_CAPITAL_RE =
  /\b(ipo (?:pipeline|window|market|weekly)|initial public offering|capital markets?|equity issuance|follow[- ]on offering|spac\b)\b/i;

const REGULATION_MARKET_RE =
  /\b(sec\b|banking regulation|antitrust|market regulation|financial regulation|dodd[- ]frank)\b/i;

const COMMODITY_MACRO_RE =
  /\b(commodity shock|commodities (?:rally|slump|surge)|gold (?:price|prices|rally) (?:on|as|after)|copper prices?|wheat prices?)\b/i;

/** Pharma/sector human-interest without clear tape impact. */
const SECTOR_HUMAN_INTEREST_RE =
  /\b(heart disease|big pharma|historic strength for|becomes a weakness)\b/i;

function reject(
  reasons: string[],
  score = 0,
  editorialBucket: string | null = null,
): MarketsRelevance {
  return {
    accepted: false,
    score,
    reasons,
    relevanceClass: 'reject',
    editorialBucket,
  };
}

/**
 * Title patterns that strongly indicate tickerless single-company framing.
 * Avoid matching English contractions (Here's) or macro possessives (Fed's).
 */
export function hasSingleNameTitleShape(title: string): boolean {
  const t = title.trim();
  if (/^[A-Z][A-Za-z0-9&.''-]{1,40}:\s+\S/.test(t)) return true;

  const MACRO_POSSESSIVE = new Set([
    'fed',
    'ecb',
    'boj',
    'opec',
    'treasury',
    'here',
    'there',
    'what',
    'that',
    'it',
    'who',
    'he',
    'she',
    'we',
    'they',
    'us',
    'un',
    'imf',
    'iea',
  ]);

  const possessive = t.match(
    /\b([A-Z][a-zA-Z]+)(?:\s([A-Z][a-zA-Z]+)){0,2}'s\b/,
  );
  if (possessive && t.split(/\s+/).length <= 14) {
    const head = String(possessive[1] ?? '').toLowerCase();
    if (!MACRO_POSSESSIVE.has(head)) return true;
  }
  return false;
}

/**
 * Heuristic: tickerless single-company framing without a market-wide signal.
 * Prefer pattern/signal detection over company-name hardcoding.
 */
export function looksLikeSingleNameContamination(input: {
  title: string;
  description?: string | null;
  tickers?: readonly string[] | null;
  hasMarketSignal: boolean;
  /** When true, title alone must carry the market signal. */
  titleHasMarketSignal?: boolean;
}): boolean {
  const tickers = (input.tickers ?? []).filter(Boolean);
  if (tickers.length > 0) return false;

  const title = input.title.trim();
  const text = `${title}\n${input.description ?? ''}`;

  if (STOCK_PICK_OPINION_RE.test(text) || SINGLE_NAME_OPINION_RE.test(text)) {
    return true;
  }

  // Colon / possessive single-name titles need a market signal *in the title*
  // so body keyword bleed cannot launder stock-pick pieces into Markets.
  if (hasSingleNameTitleShape(title)) {
    if (!input.titleHasMarketSignal) return true;
  }

  if (!input.hasMarketSignal && hasSingleNameTitleShape(title)) {
    return true;
  }

  return false;
}

function detectAcceptSignals(text: string): { reasons: string[]; bucket: string; score: number } {
  const reasons: string[] = [];
  let score = 0;
  let bucket = 'other';

  const trySignal = (re: RegExp, reason: string, pts: number, b: string) => {
    if (re.test(text)) {
      reasons.push(reason);
      score += pts;
      if (bucket === 'other') bucket = b;
    }
  };

  trySignal(FED_RATES_RE, 'fed_rates', 40, 'fed_rates');
  trySignal(INFLATION_ECONOMY_RE, 'inflation_economy', 35, 'inflation_economy');
  trySignal(OIL_ENERGY_RE, 'oil_energy', 35, 'oil_energy');
  trySignal(GEOPOLITICS_MARKET_RE, 'geopolitics_market_impact', 35, 'geopolitics');
  trySignal(BROAD_MARKET_RE, 'broad_market', 30, 'broad_market');
  trySignal(BANKING_CREDIT_RE, 'banking_credit', 30, 'banking_credit');
  trySignal(IPO_CAPITAL_RE, 'ipo_capital_markets', 25, 'ipo_capital_markets');
  trySignal(REGULATION_MARKET_RE, 'regulation_market', 20, 'regulation');
  trySignal(COMMODITY_MACRO_RE, 'commodity_macro', 20, 'commodities');

  return { reasons, bucket, score };
}

export function evaluateMarketsNewsRelevance(input: {
  title: string;
  description?: string | null;
  tickers?: readonly string[] | null;
  tags?: readonly string[] | null;
  sourceDomain?: string | null;
}): MarketsRelevance {
  const title = input.title?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  const text = `${title}\n${description}`;
  const tags = (input.tags ?? []).map((t) => String(t).toLowerCase());

  if (!title) {
    return reject(['missing_title']);
  }

  if (PERSONAL_FINANCE_RE.test(text)) {
    return reject(['personal_finance']);
  }
  if (LIFESTYLE_RE.test(text)) {
    return reject(['lifestyle']);
  }
  if (GENERIC_INVESTING_EDU_RE.test(text)) {
    return reject(['generic_investing_education']);
  }
  if (STOCK_PICK_OPINION_RE.test(text)) {
    return reject(['stock_pick_opinion']);
  }
  if (SECTOR_HUMAN_INTEREST_RE.test(title)) {
    return reject(['sector_human_interest']);
  }

  // Topic tags can reinforce oil/manda signals from the provider.
  const tagBoostText = `${text}\n${tags.join(' ')}`;
  const signals = detectAcceptSignals(tagBoostText);
  const titleSignals = detectAcceptSignals(`${title}\n${tags.join(' ')}`);
  const hasMarketSignal = signals.reasons.length > 0;
  const titleHasMarketSignal = titleSignals.reasons.length > 0;

  if (
    looksLikeSingleNameContamination({
      title,
      description,
      tickers: input.tickers,
      hasMarketSignal,
      titleHasMarketSignal,
    })
  ) {
    return reject(['single_name_opinion']);
  }

  if (!hasMarketSignal) {
    return reject(['no_market_signal']);
  }

  // Accepted Markets stories are macro/tape-relevant; reuse macro_equity.
  const score = Math.min(100, Math.max(20, signals.score));
  return {
    accepted: true,
    score,
    reasons: signals.reasons,
    relevanceClass: 'macro_equity',
    editorialBucket: signals.bucket,
  };
}
