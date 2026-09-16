/** Match token-page live cadence (post-completion setTimeout). */
export const MARKETS_LIVE_POLL_MS = 2000;

/**
 * After this many ms without a successful poll, show STALE.
 * ~3 missed cycles at the default poll interval.
 */
export const MARKETS_STALE_AFTER_MS = 6000;

/**
 * Mobile single-row tracks: rank | image | identity | FDV | trades | holders.
 * Applied below `md`; identity column truncates — never wraps the row.
 */
export const MARKETS_MOBILE_ROW_GRID =
  'grid-cols-[1.75rem_1.75rem_minmax(0,1fr)_3.5rem_2.35rem_2.35rem] items-center gap-x-2';

/**
 * Shared desktop header/row tracks: compact rank + capped MARKET + fixed metric group.
 * Leftover container width stays empty to the right (metrics are not stretched).
 * Applied from `md` so intermediate widths keep the single-row mobile layout.
 */
export const MARKETS_DESKTOP_ROW_GRID =
  'md:grid-cols-[2.5rem_minmax(10rem,28rem)_7rem_5.75rem_5.75rem] md:items-center md:gap-x-3';
