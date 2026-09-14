/**
 * Tiny pub/sub so auth entrypoints can open the SCOOP auth sheet without
 * threading React context through every call site.
 *
 * Connect-request lifecycle: requestScoopConnect → pending → sheet open →
 * settle (cancelled | completed). Entrypoints that show “Connecting…” must
 * subscribe and reset on cancelled without racing a completed connect.
 */

import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';

export type ScoopConnectOutcome = 'cancelled' | 'completed';

type ScoopAuthSheetListener = (open: boolean) => void;

type ScoopConnectRequestEvent =
  | { type: 'pending' }
  | { type: 'settled'; outcome: ScoopConnectOutcome };

type ScoopConnectRequestListener = (event: ScoopConnectRequestEvent) => void;

let sheetOpen = false;
let connectRequestPending = false;
const sheetListeners = new Set<ScoopAuthSheetListener>();
const requestListeners = new Set<ScoopConnectRequestListener>();

function notifySheet() {
  for (const listener of sheetListeners) {
    listener(sheetOpen);
  }
}

function notifyRequest(event: ScoopConnectRequestEvent) {
  for (const listener of requestListeners) {
    listener(event);
  }
}

export function subscribeScoopAuthSheet(
  listener: ScoopAuthSheetListener,
): () => void {
  sheetListeners.add(listener);
  listener(sheetOpen);
  return () => {
    sheetListeners.delete(listener);
  };
}

export function subscribeScoopConnectRequest(
  listener: ScoopConnectRequestListener,
): () => void {
  requestListeners.add(listener);
  if (connectRequestPending) {
    listener({ type: 'pending' });
  }
  return () => {
    requestListeners.delete(listener);
  };
}

export function isScoopAuthSheetOpen(): boolean {
  return sheetOpen;
}

export function isScoopConnectRequestPending(): boolean {
  return connectRequestPending;
}

export function openScoopAuthSheet(): void {
  sheetOpen = true;
  notifySheet();
}

/**
 * Close the sheet and settle any pending connect request.
 * Default outcome is cancelled (dismiss). Success paths must pass completed.
 */
export function closeScoopAuthSheet(options?: {
  outcome?: ScoopConnectOutcome;
}): void {
  const outcome = options?.outcome ?? 'cancelled';
  sheetOpen = false;
  notifySheet();
  settleScoopConnectRequest(outcome);
}

export function settleScoopConnectRequest(outcome: ScoopConnectOutcome): void {
  if (!connectRequestPending) return;
  connectRequestPending = false;
  notifyRequest({ type: 'settled', outcome });
}

/**
 * Central connect entry: custom SCOOP sheet when flagged, else AppKit modal.
 * Callers still own SIWE / join-intent around this.
 */
export function requestScoopConnect(openAppKitConnect: () => void): void {
  if (isScoopCustomAuthUiEnabled()) {
    if (!connectRequestPending) {
      connectRequestPending = true;
      notifyRequest({ type: 'pending' });
    }
    openScoopAuthSheet();
    return;
  }
  openAppKitConnect();
}
