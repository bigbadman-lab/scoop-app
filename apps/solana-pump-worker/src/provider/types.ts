/**
 * Pump trade source adapter boundary.
 * Live source (Phase 6): PumpPortal Data API.
 */

export type PumpTradeSource = 'pump' | 'pumpportal';

export type NormalizedPumpTradeEvent = {
  mint: string;
  signature: string;
  eventIndex: number;
  slot: number;
  blockTime: Date;
  side: 'buy' | 'sell';
  wallet: string | null;
  tokenAmountRaw: string;
  tokenAmount: string;
  solAmountLamports: string;
  solAmount: string;
  priceSol: string;
  source: PumpTradeSource;
  curveAddress: string | null;
  /** Optional opaque provider cursor for checkpointing. */
  providerCursor?: string | null;
  /** Provider pool/market hint (bonding curve or PumpSwap pool). */
  poolHint?: string | null;
};

export type PumpProviderStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'subscribed'
  | 'degraded'
  | 'reconnecting'
  | 'blocked_auth'
  | 'blocked_funding'
  | 'error'
  | 'idle';

export type PumpTradeProviderHealth = {
  status: PumpProviderStatus;
  error?: string | null;
  provider?: 'mock' | 'pumpportal';
  subscribedMintCount?: number;
  messagesReceived?: number;
  normalizedEvents?: number;
  invalidEvents?: number;
  reconnectCount?: number;
  lastMessageAt?: string | null;
};

export type PumpTradeHandler = (event: NormalizedPumpTradeEvent) => void | Promise<void>;

export interface PumpTradeProvider {
  connect(watchedMints: readonly string[]): Promise<void>;
  subscribeMint(mint: string): Promise<void>;
  unsubscribeMint(mint: string): Promise<void>;
  onTrade(handler: PumpTradeHandler): void;
  health(): PumpTradeProviderHealth;
  close(): Promise<void>;
}
