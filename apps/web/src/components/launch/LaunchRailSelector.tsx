'use client';

import type { LaunchRail } from '@/lib/launch/launch-rail';

type Props = {
  value: LaunchRail;
  onChange: (rail: LaunchRail) => void;
  disabled?: boolean;
};

type RailOption = {
  rail: LaunchRail;
  primary: string;
  secondary: string;
  iconSrc: string;
  iconAlt: string;
  testId: string;
};

const OPTIONS: RailOption[] = [
  {
    rail: { chain: 'robinhood', provider: 'pons' },
    primary: 'Robinhood Chain',
    secondary: 'Launch via Pons',
    iconSrc: '/brand/rh.svg',
    iconAlt: 'Robinhood Chain',
    testId: 'launch-rail-pons',
  },
  {
    rail: { chain: 'solana', provider: 'pump' },
    primary: 'Solana',
    secondary: 'Launch via Pump.fun',
    iconSrc: '/brand/solana.svg',
    iconAlt: 'Solana',
    testId: 'launch-rail-pump',
  },
];

/**
 * Explicit rail selector — never inferred from the connected wallet.
 * Default remains Robinhood → Pons. Presentation only; rail model unchanged.
 */
export function LaunchRailSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-2.5" data-testid="launch-rail-selector">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
        Launch on
      </p>
      <div
        role="group"
        aria-label="Launch rail"
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3"
      >
        {OPTIONS.map((opt) => {
          const selected =
            value.chain === opt.rail.chain && value.provider === opt.rail.provider;
          return (
            <button
              key={opt.testId}
              type="button"
              disabled={disabled}
              data-testid={opt.testId}
              aria-pressed={selected}
              aria-label={`${opt.primary}. ${opt.secondary}`}
              onClick={() => onChange(opt.rail)}
              className={[
                'group relative flex min-h-[4.25rem] w-full min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border px-3.5 py-3 text-left transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--scoop-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
                selected
                  ? 'border-[var(--fg)] bg-[var(--bg-elevated)] shadow-[0_1px_0_color-mix(in_srgb,var(--fg)_12%,transparent),0_8px_24px_-16px_color-mix(in_srgb,var(--fg)_35%,transparent)]'
                  : 'border-[var(--divider)] bg-[var(--bg)] hover:border-[color-mix(in_srgb,var(--fg)_35%,var(--divider))] hover:bg-[var(--bg-elevated)]',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              ].join(' ')}
            >
              <span
                className={[
                  'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border',
                  selected
                    ? 'border-[color-mix(in_srgb,var(--fg)_18%,var(--divider))] bg-[var(--bg)]'
                    : 'border-[var(--divider)] bg-[var(--bg-elevated)]',
                ].join(' ')}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={opt.iconSrc}
                  alt={opt.iconAlt}
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={[
                    'block truncate text-[15px] font-semibold tracking-tight',
                    selected ? 'text-[var(--fg)]' : 'text-[var(--fg)]',
                  ].join(' ')}
                >
                  {opt.primary}
                </span>
                <span
                  className={[
                    'mt-0.5 block truncate text-[12px] leading-snug',
                    selected ? 'text-[var(--muted)]' : 'text-[var(--muted-2)]',
                  ].join(' ')}
                >
                  {opt.secondary}
                </span>
              </span>
              <span
                aria-hidden
                className={[
                  'ml-auto h-2.5 w-2.5 shrink-0 rounded-full border transition',
                  selected
                    ? 'border-[var(--scoop-green)] bg-[var(--scoop-green)]'
                    : 'border-[var(--divider)] bg-transparent group-hover:border-[color-mix(in_srgb,var(--fg)_40%,var(--divider))]',
                ].join(' ')}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
