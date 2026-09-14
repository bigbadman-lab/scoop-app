/**
 * Session evidence that the current browser just launched this token.
 * Used by `/token/[address]` to avoid a false 404 during the brief indexing gap.
 * Must never be invented for arbitrary addresses — only written after a successful launch receipt.
 */

const STORAGE_KEY = 'scoop:launch:fresh-handoff';
const MAX_AGE_MS = 30 * 60 * 1000;

/** In-memory fallback when sessionStorage is unavailable (tests / private mode). */
let memoryFallback: string | null = null;

export type FreshLaunchHandoff = {
  version: 1;
  chainId: number;
  tokenAddress: `0x${string}`;
  txHash: `0x${string}`;
  name: string;
  symbol: string;
  quoteAsset: `0x${string}`;
  savedAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function writeRaw(raw: string): void {
  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, raw);
      memoryFallback = null;
      return;
    } catch {
      // private mode / sandbox
    }
  }
  memoryFallback = raw;
}

function readRaw(): string | null {
  if (canUseStorage()) {
    try {
      const fromSession = window.sessionStorage.getItem(STORAGE_KEY);
      if (fromSession != null) return fromSession;
    } catch {
      // fall through
    }
  }
  return memoryFallback;
}

function clearRaw(): void {
  memoryFallback = null;
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function saveFreshLaunchHandoff(
  handoff: Omit<FreshLaunchHandoff, 'version' | 'savedAt'> & { savedAt?: number },
): void {
  const payload: FreshLaunchHandoff = {
    version: 1,
    chainId: handoff.chainId,
    tokenAddress: handoff.tokenAddress,
    txHash: handoff.txHash,
    name: handoff.name,
    symbol: handoff.symbol,
    quoteAsset: handoff.quoteAsset,
    savedAt: handoff.savedAt ?? Date.now(),
  };
  writeRaw(JSON.stringify(payload));
}

export function loadFreshLaunchHandoff(
  tokenAddress?: string,
): FreshLaunchHandoff | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FreshLaunchHandoff;
    if (parsed.version !== 1) return null;
    if (!parsed.tokenAddress || !parsed.txHash) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearFreshLaunchHandoff();
      return null;
    }
    if (
      tokenAddress != null &&
      normalizeAddress(parsed.tokenAddress) !== normalizeAddress(tokenAddress)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearFreshLaunchHandoff(): void {
  clearRaw();
}

/** Credible fresh-launch evidence for this address in the current session. */
export function hasFreshLaunchEvidence(tokenAddress: string): boolean {
  return loadFreshLaunchHandoff(tokenAddress) != null;
}
