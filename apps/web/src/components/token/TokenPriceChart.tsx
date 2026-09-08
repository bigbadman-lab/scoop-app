'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { CandleItem } from '@scoop/db';
import { TokenChartRangeSelector } from '@/components/token/TokenChartRangeSelector';
import {
  DEFAULT_CHART_INTERVAL,
  type ChartIntervalId,
  CHART_INTERVAL_CONFIG,
} from '@/lib/token/chart-ranges';
import { fetchTokenCandles } from '@/lib/token/fetch-candles';
import {
  type ChartBasis,
  type ChartCandle,
  candlesToOhlc,
  chartBasisLabel,
  formatChartPrice,
  formatOhlcTooltip,
  selectChartBasis,
} from '@/lib/token/chart-series';

type Props = {
  tokenAddress: string;
  symbol: string;
  quoteSymbol: string;
};

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      basis: ChartBasis;
      candles: ChartCandle[];
      candleCount: number;
    };

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function formatCrosshairTime(sec: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(sec * 1000));
}

/**
 * Historical SCOOP OHLC candlestick chart from indexed candles.
 * USD-first; quote fallback when USD OHLC incomplete. No live polling.
 */
export function TokenPriceChart({ tokenAddress, symbol, quoteSymbol }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastGoodRef = useRef<LoadState | null>(null);
  const candleByTimeRef = useRef<Map<number, ChartCandle>>(new Map());

  const [interval, setInterval] = useState<ChartIntervalId>(DEFAULT_CHART_INTERVAL);
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [switching, setSwitching] = useState(false);
  const [tooltip, setTooltip] = useState<{
    timeLabel: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    async function load() {
      setSwitching(true);
      if (!lastGoodRef.current) setState({ status: 'loading' });

      const result = await fetchTokenCandles({
        tokenAddress,
        interval,
        signal: ac.signal,
      });
      if (cancelled || ac.signal.aborted) return;

      if (!result.ok) {
        if (result.error === 'aborted') return;
        if (lastGoodRef.current?.status === 'ready') {
          setState(lastGoodRef.current);
        } else {
          setState({ status: 'error', message: result.error });
        }
        setSwitching(false);
        return;
      }

      const items: CandleItem[] = result.items;
      if (items.length === 0) {
        const empty: LoadState = { status: 'empty' };
        setState(empty);
        lastGoodRef.current = empty;
        setSwitching(false);
        setTooltip(null);
        return;
      }

      const basis = selectChartBasis(items);
      const candles = candlesToOhlc(items, basis);
      if (candles.length === 0) {
        const empty: LoadState = { status: 'empty' };
        setState(empty);
        lastGoodRef.current = empty;
        setSwitching(false);
        setTooltip(null);
        return;
      }

      const ready: LoadState = {
        status: 'ready',
        basis,
        candles,
        candleCount: items.length,
      };
      setState(ready);
      lastGoodRef.current = ready;
      setSwitching(false);
    }

    void load();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [tokenAddress, interval]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || state.status !== 'ready') return;

    const fg = readCssVar('--fg', '#0a0a0a');
    const muted = readCssVar('--muted-2', '#8a8a8a');
    const divider = readCssVar('--divider', '#d8d4cd');
    const up = readCssVar('--scoop-live', '#2f9e44');
    const down = readCssVar('--scoop-orange', '#fc4c00');
    const elevated = readCssVar('--bg-elevated', '#f5f3ef');

    const map = new Map<number, ChartCandle>();
    for (const c of state.candles) map.set(c.time, c);
    candleByTimeRef.current = map;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: elevated },
        textColor: muted,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: divider, style: 3 },
        horzLines: { color: divider, style: 3 },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.06 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: interval === '1m' || interval === '5m' || interval === '15m',
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        horzLine: { color: muted, labelBackgroundColor: fg },
        vertLine: { color: muted, labelBackgroundColor: fg },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatChartPrice(price, state.basis, quoteSymbol),
        minMove: 1e-12,
      },
    });

    series.setData(
      state.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chart.timeScale().fitContent();

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        return;
      }
      const t = param.time as number;
      const candle = candleByTimeRef.current.get(t);
      if (!candle) {
        setTooltip(null);
        return;
      }
      setTooltip({
        timeLabel: formatCrosshairTime(t),
        body: formatOhlcTooltip(candle, state.basis, quoteSymbol),
      });
    };
    chart.subscribeCrosshairMove(onMove);

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [state, interval, quoteSymbol]);

  const basis = state.status === 'ready' ? state.basis : null;
  const basisText = basis ? chartBasisLabel(basis, quoteSymbol) : null;
  const intervalLabel = CHART_INTERVAL_CONFIG[interval].label;

  const summary =
    state.status === 'ready' && basisText
      ? `${symbol} OHLC price chart, ${intervalLabel} candles, quoted in ${basisText}.`
      : `${symbol} OHLC price chart, ${intervalLabel} candles.`;

  return (
    <div data-testid="token-price-chart" className="flex h-full min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2
            id="token-price-panel-heading"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
          >
            Price
            {basisText ? (
              <span data-testid="token-chart-basis" className="text-[var(--fg)]">
                {' '}
                · {basisText}
              </span>
            ) : null}
          </h2>
          {basis === 'quote' ? (
            <p
              className="mt-0.5 font-mono text-[10px] tracking-wide text-[var(--muted-2)]"
              data-testid="token-chart-basis-hint"
            >
              Quoted in {quoteSymbol}
            </p>
          ) : null}
        </div>
        <TokenChartRangeSelector
          value={interval}
          onChange={setInterval}
          disabled={switching && state.status === 'loading'}
        />
      </div>

      <p className="sr-only" data-testid="token-chart-summary">
        {summary}
      </p>

      <div
        className="relative mt-2 min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)]"
        data-testid="token-chart-frame"
      >
        {state.status === 'ready' ? (
          <>
            <div
              ref={containerRef}
              className="h-[20rem] w-full sm:h-[24rem] lg:h-[28rem]"
              data-testid="token-chart-canvas"
              data-series="candlestick"
            />
            {tooltip ? (
              <div
                className="pointer-events-none absolute left-3 top-3 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg)]/95 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-[var(--fg)] shadow-sm"
                data-testid="token-chart-ohlc-tooltip"
              >
                <p className="text-[var(--muted-2)]">{tooltip.timeLabel}</p>
                <pre className="mt-1 whitespace-pre font-mono">{tooltip.body}</pre>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex h-[20rem] items-center justify-center px-6 sm:h-[24rem] lg:h-[28rem]">
            {state.status === 'loading' ? (
              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                Loading price history
              </p>
            ) : null}
            {state.status === 'empty' ? (
              <p
                className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]"
                data-testid="token-chart-empty"
              >
                No price history yet
              </p>
            ) : null}
            {state.status === 'error' ? (
              <p
                className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]"
                data-testid="token-chart-error"
              >
                Chart unavailable
              </p>
            ) : null}
          </div>
        )}
        {switching && state.status === 'ready' ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-[var(--scoop-orange)]/40"
            aria-hidden
            data-testid="token-chart-switching"
          />
        ) : null}
      </div>
    </div>
  );
}
