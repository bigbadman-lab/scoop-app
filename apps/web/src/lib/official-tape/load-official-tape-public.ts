/**
 * Public view of official Solana $TAPE for shell / token UI.
 */

import {
  getOfficialTapeSolanaConfig,
  type OfficialTapeSolanaConfig,
} from '@/lib/official-tape/official-config';
import { serverDb } from '@/lib/server/queries';

export type OfficialTapePublic = {
  mint: string;
  lockVerified: boolean;
  unlockAt: string | null;
  lockBadgeCopy: string | null;
  tokenHref: string;
};

export function toOfficialTapePublic(
  config: OfficialTapeSolanaConfig,
): OfficialTapePublic {
  const lockBadgeCopy = config.lockVerified
    ? config.lockBadgeCopy ??
      (config.unlockAt
        ? `DEV TOKENS LOCKED UNTIL ${config.unlockAt.slice(0, 10)}`
        : 'DEV TOKENS LOCKED')
    : null;

  return {
    mint: config.mint,
    lockVerified: config.lockVerified,
    unlockAt: config.unlockAt,
    lockBadgeCopy,
    tokenHref: `/token/${config.mint}`,
  };
}

export async function loadOfficialTapePublicSafe(): Promise<OfficialTapePublic | null> {
  try {
    const db = serverDb();
    const config = await getOfficialTapeSolanaConfig(db);
    if (!config) return null;
    return toOfficialTapePublic(config);
  } catch (error) {
    console.warn('[official-tape] load failed:', error);
    return null;
  }
}
