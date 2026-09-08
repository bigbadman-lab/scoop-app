/**
 * Wallet connect/disconnect must not tear down a loaded account into the
 * signed-out Join frame — that reads as a crash/glitch while SCOOP session remains.
 */
export function shouldBlankAccountWhileRefreshing(
  prevKind: string,
  opts?: { forceBlank?: boolean },
): boolean {
  if (opts?.forceBlank) return true;
  return prevKind !== 'ready';
}
