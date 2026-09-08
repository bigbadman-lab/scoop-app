export type TokenMarketStatus = 'New' | 'Bonding' | 'Bonded';

/** Canonical product status from indexed discovery flags — no invented LIVE/ACTIVE. */
export function tokenMarketStatus(token: {
  isBonded: boolean;
  isNew: boolean;
  launchComplete: boolean;
}): TokenMarketStatus {
  if (token.isBonded || token.launchComplete) return 'Bonded';
  if (token.isNew) return 'New';
  return 'Bonding';
}

/** Show bonding progress only while the launch is incomplete. */
export function shouldShowBondingProgress(token: {
  launchComplete: boolean;
  launchProgressBps: number;
}): boolean {
  return !token.launchComplete;
}
