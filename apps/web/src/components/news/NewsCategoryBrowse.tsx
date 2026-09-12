'use client';

import Image from 'next/image';
import type { NewsFeedCategory } from '@scoop/news';
import { NEWS_CATEGORY_ARTWORK } from '@/lib/brand';
import { NEWS_CATEGORY_COPY } from '@/lib/news/category';

type Props = {
  selected: NewsFeedCategory;
  onSelect: (category: NewsFeedCategory) => void;
};

const CARD_ORDER: readonly NewsFeedCategory[] = ['stocks', 'markets'];

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
        const artwork = NEWS_CATEGORY_ARTWORK[category];
        const isSelected = selected === category;
        const descriptionId = `news-category-${category}-desc`;

        return (
          <button
            key={category}
            type="button"
            aria-pressed={isSelected}
            aria-describedby={descriptionId}
            data-testid={`news-category-${category}`}
            data-selected={isSelected ? 'true' : 'false'}
            onClick={() => onSelect(category)}
            className={[
              'relative aspect-[16/9] w-full cursor-pointer overflow-hidden rounded-[var(--radius-md)] border text-left transition-[border-color,box-shadow] duration-200 ease-out',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
              'motion-reduce:transition-none',
              isSelected
                ? [
                    'border-[color-mix(in_srgb,var(--scoop-orange)_55%,var(--divider))]',
                    'shadow-[inset_3px_0_0_var(--scoop-orange),0_0_0_1px_color-mix(in_srgb,var(--scoop-orange)_35%,transparent)]',
                  ].join(' ')
                : [
                    'border-[var(--divider)]',
                    'hover:border-[color-mix(in_srgb,var(--fg)_28%,var(--divider))]',
                    'hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--fg)_10%,transparent)]',
                  ].join(' '),
            ].join(' ')}
          >
            {/* Accessible name + description; artwork already bakes in STOCKS/MARKETS. */}
            <span className="sr-only">{copy.label}</span>
            <span id={descriptionId} className="sr-only">
              {copy.description}
            </span>

            <Image
              src={artwork.src}
              alt=""
              fill
              sizes="(max-width: 640px) 46vw, (max-width: 1100px) 28vw, 320px"
              priority
              className="object-cover object-center"
              data-testid={`news-category-${category}-artwork`}
            />

            {isSelected ? (
              <span
                className="pointer-events-none absolute right-2 top-2 z-[1] h-2 w-2 rounded-full bg-[var(--scoop-orange)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--bg)_70%,transparent)]"
                aria-hidden
                data-testid={`news-category-${category}-selected-dot`}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
