/**
 * Web-facing quote catalogue accessor.
 *
 * Queries `public_quote_catalogue` via @scoop/db (chain 4663, registered+enabled,
 * ordered by sort_order). Not wired into UI yet — selection/validation source for
 * future quote pickers and AI/news pairing.
 *
 * Future contract (do not hard-code tickers):
 *   SELECT * FROM public_quote_catalogue
 *   WHERE chain_id = 4663 AND is_registered AND is_enabled
 *   ORDER BY sort_order;
 */

import {
  CANONICAL_QUOTE_CATALOGUE_COUNT,
  SCOOP_CHAIN_ID,
  getPublicQuoteCatalogue,
  type GetPublicQuoteCatalogueOptions,
  type PublicQuoteCatalogueItem,
} from '@scoop/db';
import { serverDb } from '../server/queries';

export {
  CANONICAL_QUOTE_CATALOGUE_COUNT,
  SCOOP_CHAIN_ID,
  type PublicQuoteCatalogueItem,
};

export async function loadEnabledQuoteCatalogue(
  options: Omit<GetPublicQuoteCatalogueOptions, 'enabledOnly'> = {},
): Promise<PublicQuoteCatalogueItem[]> {
  return getPublicQuoteCatalogue(serverDb(), {
    chainId: options.chainId ?? SCOOP_CHAIN_ID,
    enabledOnly: true,
  });
}
