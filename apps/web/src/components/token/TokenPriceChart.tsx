'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { TradeItem } from '@scoop/db';
import { useTokenMarketLiveOptional } from '@/components/token/TokenMarketLiveProvider';
import { fetchTokenTrades } from '@/lib/token/fetch-trades';
import {
  type ChartBasis,
  type ChartCandle,
  CHART_DEFAULT_BAR_SPACING,
  CHART_MAX_BAR_SPACING,
  CHART_MIN_BAR_SPACING,
  activityVisibleLogicalRange,
  buildActivityCentricPlot,
  chartBasisLabel,
  formatChartPrice,
  x18ToChartNumber,
} from '@/lib/token/chart-series';
import {
  type TradeFdvContext,
  type TradeMovementBar,
  buildTradeMovementSeries,
  formatTradeMovementTooltip,
  tradeBarsToCandles,
  tradeBarsToVolume,
  tradeIdentity,
} from '@/lib/token/trade-series';

type Props = {
  tokenAddress: string;
  symbol: string;
  quoteSymbol: string;
  /** Indexed total supply for historical FDV-at-execution (canonical shared formula). */
  totalSupplyRaw: string;
  tokenDecimals: number;
  /** Indexed current USD price (x18) — price line when USD series is active. */
  currentPriceUsdX18?: string | null;
  /** Indexed current quote price (x18) — price line when quote series is active. */
  currentPriceQuoteX18?: string | null;
};

type ReadyState = {
  status: 'ready';
  basis: ChartBasis;
  candles: ChartCandle[];
  tradeBars: TradeMovementBar[];
  barCount: number;
  /** Chronological trade ids backing the series (for incremental diffs). */
  tradeIds: string[];
  apply: 'reseed' | 'append' | 'unchanged';
  appendedTradeIds: string[];
};

type LoadState =
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string }
  | ReadyState;

type HoverMeta = {
  candle: ChartCandle;
  tradeBar: TradeMovementBar;
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
    second: '2-digit',
  }).format(new Date(sec * 1000));
}

function formatAxisTick(sec: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(sec * 1000));
}

const BEARISH_RED = '#c44c3a';
const BEARISH_RED_VOL = 'rgba(196, 76, 58, 0.38)';
const BULLISH_VOL = 'rgba(47, 158, 68, 0.38)';

function seriesFromTrades(
  tradesChronoOrNewest: readonly TradeItem[],
  fdvContext: TradeFdvContext,
  apply: ReadyState['apply'] = 'reseed',
  appended: readonly TradeItem[] = [],
): LoadState {
  if (tradesChronoOrNewest.length === 0) {
    return { status: 'empty', message: 'No trade history yet' };
  }

  const series = buildTradeMovementSeries(tradesChronoOrNewest, fdvContext);
  if (series.bars.length === 0) {
    return { status: 'empty', message: '1 trade recorded' };
  }

  const appendedIds = new Set(appended.map((t) => tradeIdentity(t)));
  return {
    status: 'ready',
    basis: series.basis,
    candles: tradeBarsToCandles(series.bars),
    tradeBars: series.bars,
    barCount: series.bars.length,
    tradeIds: series.trades.map((t) => tradeIdentity(t)),
    apply,
    appendedTradeIds: series.bars
      .filter((b) => appendedIds.has(b.tradeId))
      .map((b) => b.tradeId),
  };
}

/**
 * MVP PRICE chart: trade-derived execution-to-execution movement.
 * Prefers shared TokenMarketLive trades; falls back to one-shot fetch for isolated mounts.
 */
export function TokenPriceChart({
  tokenAddress,
  symbol,
  quoteSymbol,
  totalSupplyRaw,
  tokenDecimals,
  currentPriceUsdX18 = null,
  currentPriceQuoteX18 = null,
}: Props) {
  const live = useTokenMarketLiveOptional();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const realTimeByPlotRef = useRef<Map<number, number>>(new Map());
  const hoverByPlotRef = useRef<Map<number, HoverMeta>>(new Map());
  const lastGoodRef = useRef<LoadState | null>(null);
  const plottedBarCountRef = useRef(0);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [tooltip, setTooltip] = useState<{
    timeLabel: string;
    body: string;
  } | null>(null);

  const fdvContext: TradeFdvContext = { totalSupplyRaw, tokenDecimals };

  // Shared live layer path.
  useEffect(() => {
    if (!live) return;
    if (live.tradesStatus === 'loading') {
      if (!lastGoodRef.current) setState({ status: 'loading' });
      return;
    }
    if (live.tradesStatus === 'error') {
      if (lastGoodRef.current?.status === 'ready') {
        setState(lastGoodRef.current);
      } else {
        setState({ status: 'error', message: live.tradesError ?? 'Chart unavailable' });
      }
      return;
    }

    const next = seriesFromTrades(
      live.tradesChronoAsc,
      fdvContext,
      live.tradesApply,
      live.appendedTrades,
    );
    setState(next);
    lastGoodRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    live,
    live?.tradesChronoAsc,
    live?.tradesStatus,
    live?.tradesApply,
    live?.appendedTrades,
    live?.tradesError,
    totalSupplyRaw,
    tokenDecimals,
  ]);

  // Fallback one-shot fetch when mounted outside the live provider (tests / isolated).
  useEffect(() => {
    if (live) return;
    const ac = new AbortController();
    let cancelled = false;

    async function load() {
      if (!lastGoodRef.current) setState({ status: 'loading' });

      const result = await fetchTokenTrades({
        tokenAddress,
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
        return;
      }

      const next = seriesFromTrades(result.items, fdvContext, 'reseed');
      setState(next);
      lastGoodRef.current = next;
    }

    void load();
    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tokenAddress, totalSupplyRaw, tokenDecimals]);

  // Create chart once when entering ready; tear down on leave/unmount.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || state.status !== 'ready') {
      return;
    }

    if (chartRef.current) {
      return;
    }

    const fg = readCssVar('--fg', '#0a0a0a');
    const muted = readCssVar('--muted-2', '#8a8a8a');
    const divider = readCssVar('--divider', '#d8d4cd');
    const up = readCssVar('--scoop-live', '#2f9e44');
    const elevated = readCssVar('--bg-elevated', '#f5f3ef');

    const volumeBars = tradeBarsToVolume(state.tradeBars);
    const plot = buildActivityCentricPlot(state.candles, volumeBars);
    realTimeByPlotRef.current = plot.realTimeByPlot;

    const tradeByRealTime = new Map(state.tradeBars.map((b) => [b.time, b]));
    const map = new Map<number, HoverMeta>();
    for (const c of plot.candles) {
      const real = plot.realTimeByPlot.get(c.time) ?? c.time;
      const tradeBar = tradeByRealTime.get(real);
      if (!tradeBar) continue;
      map.set(c.time, {
        candle: { ...c, time: real },
        tradeBar,
      });
    }
    hoverByPlotRef.current = map;

    const hasVolume = plot.volume.length > 0;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: elevated },
        textColor: muted,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        panes: {
          separatorColor: divider,
          separatorHoverColor: muted,
        },
      },
      localization: {
        timeFormatter: (time: number) => {
          const real = realTimeByPlotRef.current.get(Number(time));
          return formatCrosshairTime(real ?? Number(time));
        },
      },
      grid: {
        vertLines: { color: divider, style: LineStyle.SparseDotted },
        horzLines: { color: divider, style: LineStyle.SparseDotted },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: hasVolume ? 0.04 : 0.06 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
        barSpacing: CHART_DEFAULT_BAR_SPACING,
        minBarSpacing: CHART_MIN_BAR_SPACING,
        maxBarSpacing: CHART_MAX_BAR_SPACING,
        rightOffset: 0,
        tickMarkFormatter: (time: number) => {
          const real = realTimeByPlotRef.current.get(Number(time));
          if (real == null) return '';
          return formatAxisTick(real);
        },
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
      downColor: BEARISH_RED,
      borderUpColor: up,
      borderDownColor: BEARISH_RED,
      wickUpColor: up,
      wickDownColor: BEARISH_RED,
      borderVisible: true,
      wickVisible: true,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatChartPrice(price, state.basis, quoteSymbol),
        minMove: 1e-12,
      },
    });

    series.setData(
      plot.candles.map((d) => ({
        time: d.time as UTCTimestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
      })),
    );

    const spotRaw = state.basis === 'usd' ? currentPriceUsdX18 : currentPriceQuoteX18;
    const spot = x18ToChartNumber(spotRaw);
    if (spot != null && spot > 0) {
      priceLineRef.current = series.createPriceLine({
        price: spot,
        color: fg,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
    }

    if (hasVolume) {
      chart.addPane(true);
      const panes = chart.panes();
      const volumePane = panes[1];
      if (volumePane) {
        volumePane.setHeight(72);
      }
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
          priceLineVisible: false,
          lastValueVisible: false,
        },
        1,
      );
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.15, bottom: 0 },
        borderVisible: false,
      });
      volumeSeries.setData(
        plot.volume.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.value,
          color: d.up ? BULLISH_VOL : BEARISH_RED_VOL,
        })),
      );
      volumeSeriesRef.current = volumeSeries;
    }

    const applyViewport = () => {
      const width = el.clientWidth || undefined;
      const range = activityVisibleLogicalRange(plot.candles.length, {
        containerWidthPx: width,
        maxBarSpacing: CHART_MAX_BAR_SPACING,
      });
      chart.timeScale().setVisibleLogicalRange(range);
    };
    applyViewport();
    plottedBarCountRef.current = plot.candles.length;

    const onMove = (param: MouseEventParams) => {
      if (!param.time || !param.point) {
        setTooltip(null);
        return;
      }
      const meta = hoverByPlotRef.current.get(param.time as number);
      if (!meta) {
        setTooltip(null);
        return;
      }
      setTooltip({
        timeLabel: formatCrosshairTime(meta.candle.time),
        body: formatTradeMovementTooltip(meta.tradeBar, state.basis, quoteSymbol),
      });
    };
    chart.subscribeCrosshairMove(onMove);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const width = el.clientWidth || undefined;
        const range = activityVisibleLogicalRange(plottedBarCountRef.current, {
          containerWidthPx: width,
          maxBarSpacing: CHART_MAX_BAR_SPACING,
        });
        chart.timeScale().setVisibleLogicalRange(range);
      });
      ro.observe(el);
    }

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      ro?.disconnect();
      if (priceLineRef.current && seriesRef.current) {
        try {
          seriesRef.current.removePriceLine(priceLineRef.current);
        } catch {
          /* chart may already be removed */
        }
      }
      priceLineRef.current = null;
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      plottedBarCountRef.current = 0;
    };
    // Intentionally only (re)create when readiness flips or basis/symbol identity changes.
    // Data updates are handled by the incremental effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status === 'ready', state.status === 'ready' ? state.basis : null, quoteSymbol]);

  // Incremental / reseed data updates on an existing chart instance.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const volumeBars = tradeBarsToVolume(state.tradeBars);
    const plot = buildActivityCentricPlot(state.candles, volumeBars);
    realTimeByPlotRef.current = plot.realTimeByPlot;

    const tradeByRealTime = new Map(state.tradeBars.map((b) => [b.time, b]));
    const map = new Map<number, HoverMeta>();
    for (const c of plot.candles) {
      const real = plot.realTimeByPlot.get(c.time) ?? c.time;
      const tradeBar = tradeByRealTime.get(real);
      if (!tradeBar) continue;
      map.set(c.time, {
        candle: { ...c, time: real },
        tradeBar,
      });
    }
    hoverByPlotRef.current = map;

    const prevBarCount = plottedBarCountRef.current;
    const appendedBarCount = state.appendedTradeIds.length;
    const canAppend =
      state.apply === 'append' &&
      appendedBarCount > 0 &&
      prevBarCount > 0 &&
      plot.candles.length === prevBarCount + appendedBarCount;

    if (canAppend) {
      for (let i = prevBarCount; i < plot.candles.length; i += 1) {
        const c = plot.candles[i]!;
        series.update({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });
        const v = plot.volume.find((bar) => bar.time === c.time);
        if (v && volumeSeriesRef.current) {
          volumeSeriesRef.current.update({
            time: v.time as UTCTimestamp,
            value: v.value,
            color: v.up ? BULLISH_VOL : BEARISH_RED_VOL,
          });
        }
      }
    } else if (state.apply !== 'unchanged' || prevBarCount !== plot.candles.length) {
      series.setData(
        plot.candles.map((d) => ({
          time: d.time as UTCTimestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        })),
      );
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          plot.volume.map((d) => ({
            time: d.time as UTCTimestamp,
            value: d.value,
            color: d.up ? BULLISH_VOL : BEARISH_RED_VOL,
          })),
        );
      }
    }

    plottedBarCountRef.current = plot.candles.length;

    const fg = readCssVar('--fg', '#0a0a0a');
    const spotRaw = state.basis === 'usd' ? currentPriceUsdX18 : currentPriceQuoteX18;
    const spot = x18ToChartNumber(spotRaw);
    if (priceLineRef.current) {
      try {
        series.removePriceLine(priceLineRef.current);
      } catch {
        /* ignore */
      }
      priceLineRef.current = null;
    }
    if (spot != null && spot > 0) {
      priceLineRef.current = series.createPriceLine({
        price: spot,
        color: fg,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: '',
      });
    }

    const el = containerRef.current;
    const width = el?.clientWidth || undefined;
    const range = activityVisibleLogicalRange(plot.candles.length, {
      containerWidthPx: width,
      maxBarSpacing: CHART_MAX_BAR_SPACING,
    });
    // Preserve viewport when appending if user is near the live edge.
    if (canAppend) {
      const visible = chart.timeScale().getVisibleLogicalRange();
      const delta = plot.candles.length - prevBarCount;
      if (visible && delta > 0 && visible.to >= prevBarCount - 2) {
        chart.timeScale().setVisibleLogicalRange({
          from: visible.from + delta,
          to: visible.to + delta,
        });
      }
    } else if (state.apply === 'reseed') {
      chart.timeScale().setVisibleLogicalRange(range);
    }
  }, [state, currentPriceUsdX18, currentPriceQuoteX18]);

  // Tear down chart when leaving ready.
  useEffect(() => {
    if (state.status === 'ready') return;
    if (!chartRef.current) return;
    chartRef.current.remove();
    chartRef.current = null;
    seriesRef.current = null;
    volumeSeriesRef.current = null;
    priceLineRef.current = null;
    plottedBarCountRef.current = 0;
  }, [state.status]);

  const basis = state.status === 'ready' ? state.basis : null;
  const basisText = basis ? chartBasisLabel(basis, quoteSymbol) : null;

  return (
    <div data-testid="token-price-chart" className="flex min-w-0 flex-col">
      <div className="min-w-0">
        <h2
          id="token-price-panel-heading"
          className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-2)]"
          data-testid="token-chart-title"
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

      <p className="sr-only" data-testid="token-chart-summary">
        {state.status === 'ready' && basisText
          ? `${symbol} price chart, trade-derived execution path, quoted in ${basisText}.`
          : `${symbol} price chart, trade-derived execution path.`}
      </p>

      <div
        className="relative mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)]"
        data-testid="token-chart-frame"
      >
        {state.status === 'ready' ? (
          <>
            <div
              ref={containerRef}
              className="h-[18rem] w-full sm:h-[22rem] lg:h-[26.25rem]"
              data-testid="token-chart-canvas"
              data-series="candlestick"
              data-chart-mode="price"
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
          <div className="flex h-[18rem] items-center justify-center px-6 sm:h-[22rem] lg:h-[26.25rem]">
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
                {state.message}
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
      </div>
    </div>
  );
}
