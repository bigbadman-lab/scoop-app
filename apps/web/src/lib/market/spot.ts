export type DeskInstrumentId = 'eth' | 'btc' | 'spx' | 'ftse';

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
  { id: 'btc', label: 'BTC', price: null, changePct: null },
  { id: 'spx', label: 'S&P 500', price: null, changePct: null },
  { id: 'ftse', label: 'FTSE 100', price: null, changePct: null },
];

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function changeFromClose(price: number | null, previous: number | null): number | null {
  if (price == null || previous == null || previous === 0) return null;
  return ((price - previous) / previous) * 100;
}

async function fetchCrypto(): Promise<Pick<Record<DeskInstrumentId, DeskInstrument>, 'eth' | 'btc'>> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true',
    {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
    },
  );
  if (!response.ok) {
    throw new Error(`coingecko ${response.status}`);
  }
  const data = (await response.json()) as {
    ethereum?: { usd?: number; usd_24h_change?: number };
    bitcoin?: { usd?: number; usd_24h_change?: number };
  };
  return {
    eth: {
      id: 'eth',
      label: 'ETH',
      price: finiteOrNull(data.ethereum?.usd),
      changePct: finiteOrNull(data.ethereum?.usd_24h_change),
    },
    btc: {
      id: 'btc',
      label: 'BTC',
      price: finiteOrNull(data.bitcoin?.usd),
      changePct: finiteOrNull(data.bitcoin?.usd_24h_change),
    },
  };
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
      next: { revalidate: 60 },
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
