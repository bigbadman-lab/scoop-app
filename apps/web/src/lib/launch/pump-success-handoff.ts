/**
 * Temporary Pump success handoff — Gate D.
 * Intentionally separate from EVM FreshLaunchHandoff (0x-typed).
 * Do not write Solana mints into EVM-only session keys.
 */

import type { LaunchResult } from '@/lib/launch/launch-result';

const STORAGE_KEY = 'scoop:launch:pump-success-v1';
const MAX_AGE_MS = 60 * 60 * 1000;

let memoryFallback: string | null = null;

export type PumpSuccessHandoff = {
  version: 1;
  result: LaunchResult;
  name: string;
  symbol: string;
  description: string;
  imageIpfsUri: string | null;
  sourceProvider: string | null;
  sourceProviderArticleId: string | null;
  sourceDraftId: string | null;
  createdAt: number;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function savePumpSuccessHandoff(
  handoff: Omit<PumpSuccessHandoff, 'version' | 'createdAt'> & { createdAt?: number },
): void {
  const payload: PumpSuccessHandoff = {
    version: 1,
    result: handoff.result,
    name: handoff.name,
    symbol: handoff.symbol,
    description: handoff.description,
    imageIpfsUri: handoff.imageIpfsUri,
    sourceProvider: handoff.sourceProvider,
    sourceProviderArticleId: handoff.sourceProviderArticleId,
    sourceDraftId: handoff.sourceDraftId,
    createdAt: handoff.createdAt ?? Date.now(),
  };
  const raw = JSON.stringify(payload);
  if (canUseStorage()) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, raw);
      memoryFallback = null;
      return;
    } catch {
      // private mode
    }
  }
  memoryFallback = raw;
}

export function loadPumpSuccessHandoff(): PumpSuccessHandoff | null {
  const raw = (() => {
    if (canUseStorage()) {
      try {
        return window.sessionStorage.getItem(STORAGE_KEY) ?? memoryFallback;
      } catch {
        return memoryFallback;
      }
    }
    return memoryFallback;
  })();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PumpSuccessHandoff;
    if (parsed.version !== 1) return null;
    if (parsed.result?.provider !== 'pump') return null;
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) {
      clearPumpSuccessHandoff();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPumpSuccessHandoff(): void {
  memoryFallback = null;
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
