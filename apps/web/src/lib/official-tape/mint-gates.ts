/**
 * Official $TAPE mint gate helpers (symbol + creator).
 */

import {
  OFFICIAL_TAPE_DEPLOYER,
  OFFICIAL_TAPE_SYMBOL,
} from '@/lib/official-tape/constants';
import type { ExternalPumpPreflight } from '@/lib/launch/import-external-pump-market';

export function assertOfficialTapePreflight(preflight: ExternalPumpPreflight): void {
  if (preflight.symbol.trim() !== OFFICIAL_TAPE_SYMBOL) {
    throw new Error(
      `BLOCKED — symbol is ${preflight.symbol}, expected ${OFFICIAL_TAPE_SYMBOL}`,
    );
  }
  if (preflight.creator !== OFFICIAL_TAPE_DEPLOYER) {
    throw new Error(
      'BLOCKED — OFFICIAL PUMP CREATOR DOES NOT MATCH EXPECTED SCOOP DEPLOYER',
    );
  }
  if (preflight.pumpProvenance !== 'verified') {
    throw new Error('BLOCKED — Pump provenance unclear');
  }
  if (preflight.mint.startsWith('0x') || preflight.mint !== preflight.mint.trim()) {
    throw new Error('BLOCKED — mint base58 must be preserved exactly');
  }
}
