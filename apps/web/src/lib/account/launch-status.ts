/**
 * Account "Tokens launched" status label.
 *
 * Rows only appear after canonical `launches` + `tokens` exist, so the market
 * is already live. `launchComplete` means bonding graduation — not indexing.
 */
export function accountLaunchStatusLabel(launchComplete: boolean): 'Live' | 'Bonded' {
  return launchComplete ? 'Bonded' : 'Live';
}
