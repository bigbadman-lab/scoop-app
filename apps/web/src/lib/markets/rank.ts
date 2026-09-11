/**
 * Canonical `/markets` ranking: valid FDV desc, missing FDV last, address tie-break.
 * Used for SSR and live refresh so ordering never disagrees.
 */

export type RankableMarket = {
  tokenAddress: string;
  fdvUsdX18: string | null;
};

export function hasValidFdv(fdvUsdX18: string | null | undefined): boolean {
  if (fdvUsdX18 == null) return false;
  return fdvUsdX18.trim().length > 0;
}

/** Compare two non-negative decimal integer strings (x18). Descending. */
export function compareFdvX18Desc(a: string, b: string): number {
  try {
    const ba = BigInt(a.trim());
    const bb = BigInt(b.trim());
    if (ba === bb) return 0;
    return ba > bb ? -1 : 1;
  } catch {
    return b.localeCompare(a);
  }
}

export function compareMarketsByFdvDesc(a: RankableMarket, b: RankableMarket): number {
  const aOk = hasValidFdv(a.fdvUsdX18);
  const bOk = hasValidFdv(b.fdvUsdX18);
  if (aOk !== bOk) return aOk ? -1 : 1;
  if (aOk && bOk) {
    const cmp = compareFdvX18Desc(a.fdvUsdX18!, b.fdvUsdX18!);
    if (cmp !== 0) return cmp;
  }
  return a.tokenAddress.toLowerCase().localeCompare(b.tokenAddress.toLowerCase());
}

/** Dedupe by token address (last wins), then rank. */
export function rankMarketsByFdv<T extends RankableMarket>(items: readonly T[]): T[] {
  const byAddress = new Map<string, T>();
  for (const item of items) {
    byAddress.set(item.tokenAddress.toLowerCase(), item);
  }
  return [...byAddress.values()].sort(compareMarketsByFdvDesc);
}
