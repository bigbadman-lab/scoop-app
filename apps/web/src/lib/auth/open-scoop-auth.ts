/**
 * Tiny pub/sub so auth entrypoints can open the SCOOP auth sheet without
 * threading React context through every call site.
 */

import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';

type ScoopAuthSheetListener = (open: boolean) => void;

let sheetOpen = false;
const listeners = new Set<ScoopAuthSheetListener>();

function notify() {
  for (const listener of listeners) {
    listener(sheetOpen);
  }
}

export function subscribeScoopAuthSheet(
  listener: ScoopAuthSheetListener,
): () => void {
  listeners.add(listener);
  listener(sheetOpen);
  return () => {
    listeners.delete(listener);
  };
}

export function isScoopAuthSheetOpen(): boolean {
  return sheetOpen;
}

export function openScoopAuthSheet(): void {
  sheetOpen = true;
  notify();
}

export function closeScoopAuthSheet(): void {
  sheetOpen = false;
  notify();
}

/**
 * Central connect entry: custom SCOOP sheet when flagged, else AppKit modal.
 * Callers still own SIWE / join-intent around this.
 */
export function requestScoopConnect(openAppKitConnect: () => void): void {
  if (isScoopCustomAuthUiEnabled()) {
    openScoopAuthSheet();
    return;
  }
  openAppKitConnect();
}
