/** Locked SCOOP brand tokens for Phase 1 UI. */

export const SCOOP_ORANGE = '#FC4C00' as const;

/** Canonical mark asset — `public/brand/MARK.png`. */
export const SCOOP_MARK_SRC = '/brand/MARK.png' as const;

/** Front-page hero — `public/brand/scoophero.png`. */
export const SCOOP_HERO_SRC = '/brand/scoophero.png' as const;

/**
 * House imagery for the NOW lead slot.
 * Final curated evergreen images belong here (and under `public/house/`).
 * Until then, NewsLead uses the branded fallback rectangle.
 */
export const HOUSE_IMAGE_SET: readonly string[] = [
  // e.g. '/house/01.jpg', '/house/02.jpg'
];

export const ROBINHOOD_CHAIN_ID = 4663 as const;
export const ROBINHOOD_CHAIN_LABEL = 'Robinhood Chain' as const;
