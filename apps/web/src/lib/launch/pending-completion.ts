import type {
  DecodedTokenLaunched,
  LaunchTxState,
} from '@/lib/launch/tx-state';

const STORAGE_KEY = 'scoop:launch:pending-completion';
const MAX_AGE_MS = 30 * 60 * 1000;

/** In-memory fallback when sessionStorage is unavailable (tests / private mode). */
let memoryFallback: string | null = null;

export type PendingLaunchCompletion = {
  version: 1 | 2;
  chainId: number;
  tokenAddress: `0x${string}`;
  txHash: `0x${string}`;
  expectedCreatorId: `0x${string}` | null;
  expectedDeployer: `0x${string}` | null;
  decoded: DecodedTokenLaunched;
  provenance: LaunchTxState['provenance'];
  /** Manual token-image path from pin (V2.F). */
  displayImagePath: string | null;
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

export function savePendingLaunchCompletion(
  pending: Omit<PendingLaunchCompletion, 'version' | 'savedAt' | 'displayImagePath'> & {
    displayImagePath?: string | null;
    savedAt?: number;
  },
): void {
  const payload: PendingLaunchCompletion = {
    version: 2,
    chainId: pending.chainId,
    tokenAddress: pending.tokenAddress,
    txHash: pending.txHash,
    expectedCreatorId: pending.expectedCreatorId,
    expectedDeployer: pending.expectedDeployer,
    decoded: pending.decoded,
    provenance: pending.provenance,
    displayImagePath: pending.displayImagePath ?? null,
    savedAt: pending.savedAt ?? Date.now(),
  };
  writeRaw(JSON.stringify(payload));
}

export function loadPendingLaunchCompletion(): PendingLaunchCompletion | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingLaunchCompletion;
    if (parsed.version !== 1 && parsed.version !== 2) return null;
    if (!parsed.tokenAddress || !parsed.txHash || !parsed.decoded) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearPendingLaunchCompletion();
      return null;
    }
    return {
      ...parsed,
      displayImagePath: parsed.displayImagePath ?? null,
    };
  } catch {
    return null;
  }
}

export function clearPendingLaunchCompletion(): void {
  clearRaw();
}
