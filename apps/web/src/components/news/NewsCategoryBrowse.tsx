'use client';

import type { NewsFeedCategory } from '@scoop/news';
import { NEWS_CATEGORY_COPY } from '@/lib/news/category';

type Props = {
  selected: NewsFeedCategory;
  onSelect: (category: NewsFeedCategory) => void;
};

const CARD_ORDER: readonly NewsFeedCategory[] = ['stocks', 'markets'];

function DecorativeMotif({ category }: { category: NewsFeedCategory }) {
  const tokens =
    category === 'stocks'
      ? ['EQUITIES', 'EARNINGS', 'TICKERS']
      : ['RATES', 'POLICY', 'MACRO'];

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className={[
          'absolute inset-y-0 right-0 w-[42%] opacity-[0.55]',
          category === 'stocks'
            ? 'bg-[linear-gradient(135deg,transparent_0%,color-mix(in_srgb,var(--fg)_4%,transparent)_40%,transparent_70%)]'
            : 'bg-[linear-gradient(160deg,transparent_10%,color-mix(in_srgb,var(--fg)_5%,transparent)_48%,transparent_78%)]',
        ].join(' ')}
      />
      <div className="absolute bottom-2 right-2 flex flex-col items-end gap-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--muted-2)]">
        {tokens.map((token) => (
          <span key={token}>{token}</span>
        ))}
      </div>
      {category === 'stocks' ? (
        <div className="absolute left-3 top-1/2 h-px w-[28%] -translate-y-1/2 bg-[color-mix(in_srgb,var(--fg)_12%,transparent)]" />
      ) : (
        <svg
          className="absolute bottom-8 left-3 h-8 w-16 text-[color-mix(in_srgb,var(--fg)_18%,transparent)]"
          viewBox="0 0 64 32"
          fill="none"
          aria-hidden
        >
          <path
            d="M2 26 C14 26 18 8 32 12 C46 16 50 4 62 6"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}

export function NewsCategoryBrowse({ selected, onSelect }: Props) {
  return (
    <div
      className="mb-5 grid grid-cols-2 gap-2 sm:gap-3"
      role="group"
      aria-label="News feeds"
      data-testid="news-category-browse"
    >
      {CARD_ORDER.map((category) => {
        const copy = NEWS_CATEGORY_COPY[category];
        const isSelected = selected === category;
        return (
          <button
            key={category}
            type="button"
            aria-pressed={isSelected}
            data-testid={`news-category-${category}`}
            data-selected={isSelected ? 'true' : 'false'}
            onClick={() => onSelect(category)}
            className={[
              'relative min-h-[4.75rem] cursor-pointer overflow-hidden rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-200 ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
              'motion-reduce:transition-none',
              isSelected
                ? [
                    'border-[color-mix(in_srgb,var(--scoop-orange)_45%,var(--divider))]',
                    'bg-[color-mix(in_srgb,var(--scoop-orange)_6%,var(--bg))]',
                    'shadow-[inset_3px_0_0_var(--scoop-orange)]',
                  ].join(' ')
                : [
                    'border-[var(--divider)] bg-[var(--bg-elevated)]',
                    'hover:border-[color-mix(in_srgb,var(--fg)_28%,var(--divider))]',
                  ].join(' '),
            ].join(' ')}
          >
            <DecorativeMotif category={category} />
            <div className="relative z-[1] max-w-[78%]">
              <p
                className={[
                  'font-mono text-[11px] uppercase tracking-[0.16em]',
                  isSelected ? 'text-[var(--fg)]' : 'text-[var(--muted)]',
                ].join(' ')}
              >
                {copy.label}
              </p>
              <p className="mt-1 text-[12px] leading-snug text-[var(--muted)] sm:text-[13px]">
                {copy.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
