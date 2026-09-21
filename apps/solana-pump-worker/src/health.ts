import type { PumpProviderStatus } from './provider/types.js';

export type WorkerHealthState = {
  enabled: boolean;
  provider: 'mock' | 'alchemy' | null;
  watchlistSize: number;
  providerStatus: PumpProviderStatus;
  subscribedMintCount: number;
  messagesReceived: number;
  eventsReceived: number;
  eventsNormalized: number;
  eventsPersisted: number;
  duplicatesSkipped: number;
  invalidEvents: number;
  reconnectCount: number;
  lastEventAt: string | null;
  lastPersistedAt: string | null;
  lastMessageAt: string | null;
  currentError: string | null;
  checkpointStatus: string | null;
};

export function createHealthState(
  enabled: boolean,
  provider: 'mock' | 'alchemy' | null = null,
): WorkerHealthState {
  return {
    enabled,
    provider,
    watchlistSize: 0,
    providerStatus: enabled ? 'disconnected' : 'idle',
    subscribedMintCount: 0,
    messagesReceived: 0,
    eventsReceived: 0,
    eventsNormalized: 0,
    eventsPersisted: 0,
    duplicatesSkipped: 0,
    invalidEvents: 0,
    reconnectCount: 0,
    lastEventAt: null,
    lastPersistedAt: null,
    lastMessageAt: null,
    currentError: null,
    checkpointStatus: null,
  };
}
