export type DeskInstrumentId = 'eth' | 'sol' | 'btc' | 'spx' | 'ftse';

export type DeskInstrument = {
  id: DeskInstrumentId;
  label: string;
  price: number | null;
  /** Percent change (e.g. -0.38 for −0.38%). Null when unknown. */
  changePct: number | null;
};

export type SpotPayload = {
  instruments: DeskInstrument[];
  asOf: string;
  source: 'live' | 'partial' | 'unavailable';
};

const EMPTY: DeskInstrument[] = [
  { id: 'eth', label: 'ETH', price: null, changePct: null },
  { id: 'sol', label: 'SOL', price: null, changePct: null },
  { id: 'btc', label: 'BTC', price: null, changePct: null },
  { id: 'spx', label: 'S&P 500', price: null, changePct: null },
  { id: 'ftse', label: 'FTSE 100', price: null, changePct: null },
];

const X18 = BigInt(10) ** BigInt(18);

/** Stable empty snapshot for SSR / failed feeds — keeps pill slots reserved. */
export function emptySpotPayload(): SpotPayload {
  return {
    instruments: EMPTY.map((item) => ({ ...item })),
    asOf: new Date().toISOString(),
    source: 'unavailable',
  };
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function changeFromClose(price: number | null, previous: number | null): number | null {
  if (price == null || previous == null || previous === 0) return null;
  return ((price - previous) / previous) * 100;
}

/**
 * Convert a positive USD spot number to x18 without fabricating zero.
 * Uses fixed decimal string path (not float×1e18).
 */
export function usdNumberToX18(usd: number | null | undefined): bigint | null {
  if (usd == null || !Number.isFinite(usd) || usd <= 0) return null;
  const fixed = usd.toFixed(12);
  const [wholePart, fracPart = ''] = fixed.split('.');
  const whole = BigInt(wholePart || '0');
  const fracPadded = (fracPart + '0'.repeat(18)).slice(0, 18);
  const raw = whole * X18 + BigInt(fracPadded || '0');
  return raw > BigInt(0) ? raw : null;
}

type CryptoSpot = {
  eth: DeskInstrument;
  sol: DeskInstrument;
  btc: DeskInstrument;
  /** SOL/USD from the same CoinGecko request — used by Solana USD market conversion. */
  solUsd: number | null;
};

/**
 * Single CoinGecko simple/price call for ETH, SOL, and BTC.
 * Shared by the desk ticker and Solana USD market conversion.
 */
async function fetchCrypto(): Promise<CryptoSpot> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana&vs_currencies=usd&include_24hr_change=true',
    {
      headers: { Accept: 'application/json' },
      next: { revalidate: 20 },
    },
  );
  if (!response.ok) {
    throw new Error(`coingecko ${response.status}`);
  }
  const data = (await response.json()) as {
    ethereum?: { usd?: number; usd_24h_change?: number };
    bitcoin?: { usd?: number; usd_24h_change?: number };
    solana?: { usd?: number; usd_24h_change?: number };
  };
  const solUsd = finiteOrNull(data.solana?.usd);
  return {
    eth: {
      id: 'eth',
      label: 'ETH',
      price: finiteOrNull(data.ethereum?.usd),
      changePct: finiteOrNull(data.ethereum?.usd_24h_change),
    },
    sol: {
      id: 'sol',
      label: 'SOL',
      price: solUsd,
      changePct: finiteOrNull(data.solana?.usd_24h_change),
    },
    btc: {
      id: 'btc',
      label: 'BTC',
      price: finiteOrNull(data.bitcoin?.usd),
      changePct: finiteOrNull(data.bitcoin?.usd_24h_change),
    },
    solUsd,
  };
}

/**
 * Server-side SOL/USD as x18 for Pump market USD derivation.
 * Reuses the desk CoinGecko fetch/cache; null when unavailable (never fake 0).
 */
export async function getSolUsdX18(): Promise<bigint | null> {
  try {
    const crypto = await fetchCrypto();
    return usdNumberToX18(crypto.solUsd);
  } catch {
    return null;
  }
}

async function fetchYahooIndex(
  symbol: string,
  id: DeskInstrumentId,
  label: string,
): Promise<DeskInstrument> {
  const encoded = encodeURIComponent(symbol);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=2d`,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; ScoopDesk/1.0)',
      },
      next: { revalidate: 20 },
    },
  );
  if (!response.ok) {
    throw new Error(`yahoo ${symbol} ${response.status}`);
  }
  const data = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          regularMarketPrice?: number;
          previousClose?: number;
          chartPreviousClose?: number;
        };
      }>;
    };
  };
  const meta = data.chart?.result?.[0]?.meta;
  const price = finiteOrNull(meta?.regularMarketPrice);
  const previous =
    finiteOrNull(meta?.previousClose) ?? finiteOrNull(meta?.chartPreviousClose);
  return {
    id,
    label,
    price,
    changePct: changeFromClose(price, previous),
  };
}

export async function loadDeskSpot(): Promise<SpotPayload> {
  const asOf = new Date().toISOString();
  const settled = await Promise.allSettled([
    fetchCrypto(),
    fetchYahooIndex('^GSPC', 'spx', 'S&P 500'),
    fetchYahooIndex('^FTSE', 'ftse', 'FTSE 100'),
  ]);

  const byId = new Map<DeskInstrumentId, DeskInstrument>(
    EMPTY.map((item) => [item.id, item]),
  );

  const cryptoResult = settled[0];
  if (cryptoResult.status === 'fulfilled') {
    byId.set('eth', cryptoResult.value.eth);
    byId.set('sol', cryptoResult.value.sol);
    byId.set('btc', cryptoResult.value.btc);
  }

  const spxResult = settled[1];
  if (spxResult.status === 'fulfilled') {
    byId.set('spx', spxResult.value);
  }

  const ftseResult = settled[2];
  if (ftseResult.status === 'fulfilled') {
    byId.set('ftse', ftseResult.value);
  }

  const instruments = EMPTY.map((item) => byId.get(item.id) ?? item);
  const withPrice = instruments.filter((item) => item.price != null).length;
  const source: SpotPayload['source'] =
    withPrice === 0 ? 'unavailable' : withPrice === instruments.length ? 'live' : 'partial';

  return { instruments, asOf, source };
}

/**
 * Homepage-safe loader: never throws; returns empty slots if upstream fails.
 * Relies on fetch `next.revalidate` inside loadDeskSpot for short caching.
 */
export async function loadDeskSpotSafe(): Promise<SpotPayload> {
  try {
    return await loadDeskSpot();
  } catch {
    return emptySpotPayload();
  }
}
