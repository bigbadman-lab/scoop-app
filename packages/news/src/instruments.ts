/**
 * Equity-only filter for Stock News API top-mentioned universe.
 * Drops ETFs, funds, ETNs, leveraged products, and commodity proxies.
 */

const ETF_FUND_NAME_RE =
  /\b(etf|etn|fund,?\s*lp|ultra |proshares|ishares|spdr|vaneck|invesco|vanguard|direxion|franklin ftse|ipath|bloomberg crude|total return index)\b/i;

/** Known non-company symbols from D.2 test + common index/commodity proxies. */
const NON_EQUITY_TICKERS = new Set([
  'XOP',
  'OIH',
  'IEO',
  'USO',
  'UCO',
  'PXJ',
  'OIL',
  'GUSH',
  'DBO',
  'BNO',
  'VOO',
  'SPY',
  'IVV',
  'HEWC',
  'FLCA',
  'SPXL',
  'SSO',
  'UPRO',
  'SPLG',
  'QQQ',
  'IWM',
  'DIA',
  'GLD',
  'SLV',
  'TLT',
  'HYG',
  'LQD',
  'EWC',
  'AAAU',
  'GLDM',
  'DGL',
  'DGP',
  'DBP',
  'VIX',
  'UVXY',
  'TQQQ',
  'SQQQ',
]);

/**
 * Curated liquid equities used when `/top-mention` is blocked by plan.
 * Prefer live top-mention whenever the subscription allows it.
 */
export const CURATED_EQUITY_SEED: ReadonlyArray<{ ticker: string; name: string }> = [
  { ticker: 'NVDA', name: 'NVIDIA Corporation' },
  { ticker: 'AMZN', name: 'Amazon.com, Inc.' },
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'MSFT', name: 'Microsoft Corporation' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.' },
  { ticker: 'META', name: 'Meta Platforms, Inc.' },
  { ticker: 'TSLA', name: 'Tesla, Inc.' },
  { ticker: 'AMD', name: 'Advanced Micro Devices, Inc.' },
  { ticker: 'INTC', name: 'Intel Corporation' },
  { ticker: 'AVGO', name: 'Broadcom Inc.' },
  { ticker: 'QCOM', name: 'QUALCOMM Incorporated' },
  { ticker: 'ASML', name: 'ASML Holding N.V.' },
  { ticker: 'TSM', name: 'Taiwan Semiconductor Manufacturing' },
  { ticker: 'NFLX', name: 'Netflix, Inc.' },
  { ticker: 'ORCL', name: 'Oracle Corporation' },
  { ticker: 'CRM', name: 'Salesforce, Inc.' },
  { ticker: 'PLTR', name: 'Palantir Technologies Inc.' },
  { ticker: 'IONQ', name: 'IonQ, Inc.' },
  { ticker: 'NVS', name: 'Novartis AG' },
  { ticker: 'NVO', name: 'Novo Nordisk A/S' },
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.' },
  { ticker: 'BAC', name: 'Bank of America Corporation' },
  { ticker: 'XOM', name: 'Exxon Mobil Corporation' },
  { ticker: 'CVX', name: 'Chevron Corporation' },
  { ticker: 'NEE', name: 'NextEra Energy, Inc.' },
  { ticker: 'BA', name: 'The Boeing Company' },
  { ticker: 'LMT', name: 'Lockheed Martin Corporation' },
  { ticker: 'COST', name: 'Costco Wholesale Corporation' },
  { ticker: 'WMT', name: 'Walmart Inc.' },
  { ticker: 'DIS', name: 'The Walt Disney Company' },
  { ticker: 'UNH', name: 'UnitedHealth Group Incorporated' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
  { ticker: 'V', name: 'Visa Inc.' },
  { ticker: 'MA', name: 'Mastercard Incorporated' },
  { ticker: 'ROIV', name: 'Roivant Sciences Ltd.' },
  { ticker: 'BE', name: 'Bloom Energy Corporation' },
  { ticker: 'AMAT', name: 'Applied Materials, Inc.' },
  { ticker: 'MU', name: 'Micron Technology, Inc.' },
  { ticker: 'SMCI', name: 'Super Micro Computer, Inc.' },
  { ticker: 'ARM', name: 'Arm Holdings plc' },
];

export type MentionInstrument = {
  ticker: string;
  name?: string | null;
  totalMentions?: number | null;
  sentimentScore?: number | null;
};

export type InstrumentClass = 'equity' | 'non_equity';

export function classifyMentionInstrument(input: {
  ticker: string;
  name?: string | null;
}): InstrumentClass {
  const ticker = String(input.ticker ?? '')
    .trim()
    .toUpperCase();
  const name = String(input.name ?? '');

  if (!ticker) return 'non_equity';
  if (NON_EQUITY_TICKERS.has(ticker)) return 'non_equity';
  if (ETF_FUND_NAME_RE.test(name)) return 'non_equity';
  // Leveraged / inverse product ticker patterns (3x, 2x suffixes common on Direxion etc.)
  if (/^(LAB[UD]|T[A-Z]{2,4})$/.test(ticker) && /3x|2x|daily|bear|bull/i.test(name)) {
    return 'non_equity';
  }
  return 'equity';
}

export function filterEquityMentions<T extends MentionInstrument>(
  mentions: readonly T[],
): { equities: T[]; removed: T[] } {
  const equities: T[] = [];
  const removed: T[] = [];
  for (const m of mentions) {
    if (classifyMentionInstrument(m) === 'equity') equities.push(m);
    else removed.push(m);
  }
  return { equities, removed };
}

export function curatedEquityMentions(): MentionInstrument[] {
  return CURATED_EQUITY_SEED.map((row) => ({
    ticker: row.ticker,
    name: row.name,
    totalMentions: null,
    sentimentScore: null,
  }));
}
