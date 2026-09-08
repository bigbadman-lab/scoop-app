/** Locked SCOOP brand tokens for Phase 1 UI. */

export const SCOOP_ORANGE = '#FC4C00' as const;

/** Canonical mark asset — `public/brand/MARK.png`. */
export const SCOOP_MARK_SRC = '/brand/MARK.png' as const;

/** Front-page brand strip — `public/scoophero.png`. */
export const SCOOP_HERO_SRC = '/scoophero.png' as const;

/**
 * Evergreen house imagery for the NOW lead tile (rotate 01 → 02 → 03).
 * Drop files under `public/house/` then list public paths here.
 * Do not invent missing URLs — leave empty until assets exist.
 */
export const HOUSE_IMAGE_SET: readonly string[] = [
  // '/house/01.webp',
  // '/house/02.webp',
  // '/house/03.webp',
];

/** Interval for house-image crossfade rotation (ms). */
export const HOUSE_IMAGE_ROTATE_MS = 10_000;

export const ROBINHOOD_CHAIN_ID = 4663 as const;
export const ROBINHOOD_CHAIN_LABEL = 'Robinhood Chain' as const;

/** Official SCOOP presence on X. */
export const SCOOP_X_URL = 'https://x.com/scoopterminal' as const;
