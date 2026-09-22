/** Locked SCOOP brand tokens for Phase 1 UI. */

/** Canonical SCOOP green. Paper contrast is required on fills — near-black fails on this green. */
export const SCOOP_GREEN = '#015225' as const;
export const SCOOP_GREEN_CONTRAST = '#f5f3ef' as const;

/** Canonical mark asset — `public/brand/logogreen.png`. */
export const SCOOP_MARK_SRC = '/brand/logogreen.png' as const;

/** Signed-out SCOOP brand avatar — same mark as the site logo, not a user identity. */
export const SCOOP_AVATAR_SRC = SCOOP_MARK_SRC;

/** Front-page brand strip — `public/scoophero.png`. */
export const SCOOP_HERO_SRC = '/scoophero.png' as const;

/** /news Browse Feeds card artwork (WebP). Intrinsic 1200×675 (16:9). */
export const NEWS_CATEGORY_ARTWORK = {
  stocks: { src: '/brand/stocknews.webp' as const },
  markets: { src: '/brand/marketnews.webp' as const },
} as const;

/**
 * Evergreen house imagery for the NOW lead tile.
 * Production uses a single cover; multiple paths enable optional rotation.
 * Drop files under `public/house/` then list public paths here.
 */
export const HOUSE_IMAGE_SET: readonly string[] = ['/house/place4.webp'];

/** Interval for house-image crossfade rotation (ms). */
export const HOUSE_IMAGE_ROTATE_MS = 10_000;

export const ROBINHOOD_CHAIN_ID = 4663 as const;
export const ROBINHOOD_CHAIN_LABEL = 'Robinhood Chain' as const;

/** Official SCOOP presence on X. */
export const SCOOP_X_URL = 'https://x.com/scoopterminal' as const;

/** Official SCOOP application repository. */
export const SCOOP_APP_GITHUB_URL =
  'https://github.com/bigbadman-lab/scoop-app' as const;
