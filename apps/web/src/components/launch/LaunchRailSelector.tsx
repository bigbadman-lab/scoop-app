'use client';

import type { LaunchRail } from '@/lib/launch/launch-rail';
import { launchRailLabel } from '@/lib/launch/launch-rail';

type Props = {
  value: LaunchRail;
  onChange: (rail: LaunchRail) => void;
  disabled?: boolean;
};

/**
 * Explicit rail selector — never inferred from the connected wallet.
 * Default remains Robinhood → Pons.
 */
export function LaunchRailSelector({ value, onChange, disabled }: Props) {
  const options: LaunchRail[] = [
    { chain: 'robinhood', provider: 'pons' },
    { chain: 'solana', provider: 'pump' },
  ];

  return (
    <div className="space-y-2" data-testid="launch-rail-selector">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
        Launch on
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const selected =
            value.chain === opt.chain && value.provider === opt.provider;
          return (
            <button
              key={`${opt.chain}-${opt.provider}`}
              type="button"
              disabled={disabled}
              data-testid={`launch-rail-${opt.provider}`}
              aria-pressed={selected}
              onClick={() => onChange(opt)}
              className={[
                'rounded-[var(--radius-md)] border px-4 py-3 text-left transition',
                selected
                  ? 'border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]'
                  : 'border-[var(--divider)] bg-[var(--bg)] text-[var(--fg)] hover:border-[var(--fg)]/40',
                disabled ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <span className="block text-sm font-semibold tracking-tight">
                {launchRailLabel(opt)}
              </span>
              <span
                className={[
                  'mt-0.5 block text-xs',
                  selected ? 'opacity-70' : 'text-[var(--muted)]',
                ].join(' ')}
              >
                {opt.provider === 'pump'
                  ? 'Create on Pump.fun (Solana)'
                  : 'Create on Pons (Robinhood Chain)'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
