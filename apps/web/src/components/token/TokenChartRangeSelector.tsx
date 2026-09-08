'use client';

import { CHART_INTERVALS, type ChartIntervalId } from '@/lib/token/chart-ranges';

type Props = {
  value: ChartIntervalId;
  onChange: (interval: ChartIntervalId) => void;
  disabled?: boolean;
};

/** Candle size selector (1m / 5m / 15m / 1h / 4h / 1d). */
export function TokenChartRangeSelector({ value, onChange, disabled }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Candle interval"
      className="flex flex-wrap gap-0.5"
      data-testid="token-chart-range-selector"
    >
      {CHART_INTERVALS.map((interval) => {
        const selected = interval === value;
        return (
          <button
            key={interval}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={disabled}
            data-testid={`token-chart-interval-${interval}`}
            onClick={() => onChange(interval)}
            className={[
              'min-h-8 min-w-9 rounded-[var(--radius-sm)] px-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors',
              selected
                ? 'bg-[var(--fg)] text-[var(--bg)] underline decoration-[var(--scoop-orange)] decoration-2 underline-offset-4'
                : 'text-[var(--muted)] hover:text-[var(--fg)]',
              disabled ? 'opacity-50' : '',
            ].join(' ')}
          >
            {interval}
          </button>
        );
      })}
    </div>
  );
}
