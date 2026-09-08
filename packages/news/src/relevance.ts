/**
 * SCOOP stock-market relevance policy for news ingest.
 * Deterministic — no LLM. Prefer precision over filling the feed.
 *
 * Core rule (D.1b): a provider ticker is evidence, not sufficient proof.
 * Acceptance requires a real equity catalyst OR clear macro-equity impact.
 */

export type ScoopNewsRelevanceClass =
  | 'company'
  | 'sector'
  | 'macro_equity'
  | 'reject';

export type ScoopNewsRelevance = {
  accepted: boolean;
  score: number;
  reasons: string[];
  tickers: string[];
  relevanceClass: ScoopNewsRelevanceClass;
};

/** Ambiguous / non-equity tags that providers sometimes attach falsely. */
const NOISE_TICKERS = new Set([
  'AI',
  'IT',
  'IMF',
  'AAIC',
  'ALL',
  'FOR',
  'ARE',
  'THE',
  'AND',
  'YOU',
  'NEW',
  'NOW',
  'DAY',
  'ONE',
  'TWO',
  'TOP',
  'HOT',
  'BIG',
  'USD',
  'EUR',
  'GBP',
  'BTC',
  'ETH',
  'CRYPTO',
  'SDK',
  'USA',
  'CA',
  'OTC',
  'MRO',
  'CEO',
  'CFO',
  'IPO',
  'ETF',
]);

const SPORTS_RE =
  /\b(champions league|premier league|la liga|serie a|world cup|nba|nfl|mlb|nhl|soccer|football match|matchday|fixture|roster move|transfer window|ufc|wwe|game seven|playoffs?\b|tournament)\b/i;

const GAMING_ENTERTAINMENT_RE =
  /\b(rpg\b|street fighter|video game|game release|gaming|esports|box office|movie review|film review|netflix show|streaming series|cast(ing)? news|director says|celebrity|emmy|grammy|oscar|fashion week|wachowski|matrix as|disney world|theme park)\b/i;

const CONSUMER_LIFESTYLE_RE =
  /\b(pickup truck|truck redesign|hatchback|best realtor|realtor in|girl scouts?|cookie season|travel tips|shopping tips|home tips|weight loss|dating|horoscope|crossword|sudoku|recipe|lifestyle)\b/i;

const PERSONAL_FINANCE_RE =
  /\b(how to invest|best credit card|refinance your|mortgage tips|budgeting tips|retirement calculator|save for college|best places to buy|price of gold today|gold price today)\b/i;

const CRYPTO_ONLY_RE =
  /\b(bitcoin|ethereum|solana|crypto\s*(winter|bull|bear|rally|crash|token)|nft\b|web3\b|defi\b|memecoin)\b/i;

const ALGO_TRADING_SPAM_RE =
  /\b(price action|algorithmic entry|entry frameworks?|trading frameworks?|market line|risk (?:allocation )?models?|technical signals?|momentum setups?|liquidity mapping|rule-based strategy|scalable risk|tactical trading|price-driven insight|movements inform risk|suddenly back in focus|should you buy\?|bulls test key technical|technical levels|forecast: bulls)\b/i;

const PEER_COMPARISON_SPAM_RE =
  /\b(head[- ]?to[- ]?head|critical (?:survey|analysis|review|comparison)|financial (?:contrast|comparison|survey)|contrasting\b|comparing\b|reviewing\b|and its (?:competitors|rivals|peers)|vs\.? its (?:peers|rivals)|versus its (?:peers|rivals)|peer comparison)\b/i;

const GENERIC_PR_RE =
  /\b(opens .{0,40}grant applications|maternal health grant|fact sheet|announces participation|to present at|presenting at|investor conference|fireside chat|annual .{0,40}forum|investor day|introduces .{0,30}sdk|edge ai sdk|generation award)\b/i;

const ALWAYS_REJECT_PR_RE =
  /\b(franchise business model|workplace advantage|benefit offerings|strengthen benefit|partner to bring)\b/i;

const LAWSUIT_SOLICITATION_RE =
  /\b(investors have opportunity to lead|encourages .{0,40}(?:shareholders|\$hareholders) to contact|equity alert|shareholder (?:alert|rights law firm)|monteverde|class action firm encourages|suewallst|lead plaintiff deadline|reminds (?:shareholders|investors) of a lead plaintiff|bernstein liebhard|reminds .{0,40} investors)\b/i;

const SOFT_OPINION_RE =
  /\b(next big catalyst for the stock|worth \$\d[\d.,]* trillion|what is shifting at|things to know before the stock market opens|\d+ reasons to (?:like|buy)|reasons to like|trending stock: facts to know|facts to know before betting|investors heavily search|here is what you need to know|smarter bet right now|forget \w+: this .{0,40} is the smarter|contributors and detractors|leveraged etf areas|time to buy the stock|top stock for the long[- ]term|buy the dip|deserves one last chance|this was the turning point|most important ai picks?|my target was hit|coiled spring ready to pounce|outpaces its industry)\b/i;

const ETF_COMMENTARY_RE =
  /\b(leveraged etf|etf areas of last week|etf areas\b|proshares|direxion dly)\b/i;

/** Positive company/equity catalyst taxonomy. */
const EQUITY_EVENT_RE =
  /\b(?:earnings|eps\b|guidance|outlook|revenue|profit warning|beats estimates|misses estimates|merger|acquisition|to acquire|m&a\b|takeover|tender offer|class action|upgrade[sd]?|downgrade[sd]?|price target|initiates coverage|coverage initiated|earns? (?:a )?(?:buy|hold|neutral) rating|reaffirms? (?:neutral|buy|hold)|overweight|underweight|sec\b|doj\b|ftc\b|lawsuit|settlement|securities fraud|ceo\b|cfo\b|appoints|resigns|steps down|dividend|buyback|share repurchase|capital raise|ipo\b|spac\b|bankruptcy|chapter 11|layoff|restructuring|fda\b|clinical trial|trial setback|failed trial|approval|major contract|wins? (?:a |the )?major contract|partnership with|spin-?off|delisting|tariff|sanction|export control|stock (?:is )?up \d|shares? (?:jump|surge|plunge|rally|fall|fell)|exchange offers?|insider (?:selling|buying)|coo sells|sets? new 52-week|ex-dividend|board (?:voice|appointment|appoints|member)|silicon deal|doe .{0,20}loan|loan for|sales crippled|pipeline setbacks?|revised (?:full-year )?outlook|robust['']? data)\b|(?:climbs?|jumps?|surges?|falls?|drops?|rises?|rall(?:y|ies))\s+\d+\s*%|\bacquires?\s+(?!shares\b)[A-Z]/i;

const MACRO_EQUITY_RE =
  /\b(federal reserve|fomc\b|interest rate|rate cut|rate hike|inflation|cpi\b|ppi\b|jobs report|nonfarm|treasury yield|s&p\s*500|nasdaq(?:\s*composite|\s*100|-100)|dow jones|equity market|stock market|wall street|export controls?|trade war|sector[- ]wide|banking regulation|oil shock|commodity shock)\b/i;

export function filterEquityTickers(tickers: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tickers) {
    const t = String(raw).trim().toUpperCase();
    if (!t || NOISE_TICKERS.has(t) || seen.has(t)) continue;
    // Equity symbols are typically 1–5 alnum chars (allow . for BRK.B-style).
    if (!/^[A-Z][A-Z0-9.]{0,4}$/.test(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function reject(
  reasons: string[],
  tickers: string[],
  score = 0,
): ScoopNewsRelevance {
  return {
    accepted: false,
    score,
    reasons,
    tickers,
    relevanceClass: 'reject',
  };
}

export function evaluateScoopNewsRelevance(input: {
  title: string;
  description?: string | null;
  tickers?: readonly string[] | null;
  tags?: readonly string[] | null;
  sourceDomain?: string | null;
}): ScoopNewsRelevance {
  const title = input.title?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  const text = `${title}\n${description}`;
  const rawTickers = (input.tickers ?? []).map((t) => String(t).trim().toUpperCase());
  const tickers = filterEquityTickers(input.tickers ?? []);
  const ambiguousOnly =
    rawTickers.length > 0 &&
    tickers.length === 0 &&
    rawTickers.every((t) => NOISE_TICKERS.has(t) || !/^[A-Z][A-Z0-9.]{0,4}$/.test(t));

  if (!title) {
    return reject(['missing_title'], tickers);
  }

  if (SPORTS_RE.test(text)) {
    return reject(['sports'], tickers);
  }
  if (GAMING_ENTERTAINMENT_RE.test(text)) {
    return reject(['gaming_entertainment'], tickers);
  }
  if (CONSUMER_LIFESTYLE_RE.test(text)) {
    return reject(['consumer_lifestyle'], tickers);
  }
  if (PERSONAL_FINANCE_RE.test(text)) {
    return reject(['personal_finance'], tickers);
  }
  if (ALGO_TRADING_SPAM_RE.test(text)) {
    return reject(['algo_trading_spam'], tickers);
  }
  if (PEER_COMPARISON_SPAM_RE.test(text)) {
    return reject(['peer_comparison_spam'], tickers);
  }
  if (LAWSUIT_SOLICITATION_RE.test(text)) {
    return reject(['lawsuit_solicitation'], tickers);
  }
  if (SOFT_OPINION_RE.test(text)) {
    return reject(['soft_opinion'], tickers);
  }
  if (ETF_COMMENTARY_RE.test(text)) {
    return reject(['etf_commentary'], tickers);
  }
  if (ALWAYS_REJECT_PR_RE.test(text)) {
    return reject(['generic_pr'], tickers);
  }
  if (/\bform\s*8\.[35]\b/i.test(title)) {
    return reject(['form_83'], tickers);
  }

  const equityHit = EQUITY_EVENT_RE.test(text);
  const macroHit = MACRO_EQUITY_RE.test(text);
  const cryptoHit = CRYPTO_ONLY_RE.test(text);
  const genericPr = GENERIC_PR_RE.test(text);
  const conferencePr =
    /\b(announces participation|to present at|presenting at|investor conference|fireside chat|annual .{0,40}forum|investor day)\b/i.test(
      title,
    );

  // Thin "board voice" blurbs without a named appointment/resignation.
  if (/\bboard voice\b/i.test(title) && !/\b(appoints|resigns|steps down|names|named)\b/i.test(text)) {
    return reject(['generic_pr'], tickers);
  }

  if (cryptoHit && !equityHit && !macroHit) {
    return reject(
      tickers.length === 0 ? ['crypto_only'] : ['crypto_ticker_noise'],
      tickers,
    );
  }

  if ((genericPr || conferencePr) && !equityHit && !macroHit) {
    return reject([conferencePr ? 'conference_pr' : 'generic_pr'], tickers);
  }

  if (ambiguousOnly && !equityHit && !macroHit) {
    return reject(['ambiguous_ticker'], tickers);
  }

  // Hard gate: ticker alone is never enough.
  if (!equityHit && !macroHit) {
    return reject(
      [tickers.length === 0 ? 'no_equity_event' : 'no_equity_event'],
      tickers,
    );
  }

  const reasons: string[] = [];
  let score = 0;

  if (equityHit) {
    score += 40;
    reasons.push('equity_event');
  }
  if (macroHit) {
    score += 25;
    reasons.push('macro_equity');
  }
  if (tickers.length > 0) {
    score += Math.min(25, 10 + tickers.length * 3);
    reasons.push('provider_tickers');
  }
  if (cryptoHit && equityHit) {
    score -= 10;
    reasons.push('crypto_mixed');
  }

  let relevanceClass: ScoopNewsRelevanceClass = 'reject';
  if (equityHit && tickers.length > 0) {
    relevanceClass = 'company';
  } else if (equityHit && tickers.length === 0) {
    relevanceClass = 'sector';
  } else if (macroHit) {
    relevanceClass = 'macro_equity';
  }

  // Company stories need ticker + equity event; macro may stand alone.
  const accepted =
    (relevanceClass === 'company' && equityHit && tickers.length > 0) ||
    (relevanceClass === 'sector' && equityHit) ||
    (relevanceClass === 'macro_equity' && macroHit);

  if (!accepted || score < 20) {
    reasons.push('no_equity_event');
    return reject(reasons, tickers, Math.max(0, score));
  }

  return {
    accepted: true,
    score: Math.min(100, Math.max(0, score)),
    reasons,
    tickers,
    relevanceClass,
  };
}
