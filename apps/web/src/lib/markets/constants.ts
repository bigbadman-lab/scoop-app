/** Match token-page live cadence (post-completion setTimeout). */
export const MARKETS_LIVE_POLL_MS = 2000;

/**
 * After this many ms without a successful poll, show STALE.
 * ~3 missed cycles at the default poll interval.
 */
export const MARKETS_STALE_AFTER_MS = 6000;

/**
 * Shared desktop header/row tracks: compact rank + capped MARKET + fixed metric group.
 * Leftover container width stays empty to the right (metrics are not stretched).
 * Applied from `md` so intermediate widths keep the stacked mobile layout.
 */
export const MARKETS_DESKTOP_ROW_GRID =
  'md:grid-cols-[2.75rem_minmax(12rem,26rem)_8rem_6.75rem_6.75rem] md:items-center md:gap-x-4';
