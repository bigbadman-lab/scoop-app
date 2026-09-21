/**
 * Pump trade source adapter boundary.
 * Live source: Alchemy Solana RPC / WebSocket (SOLANA_RPC_URL).
 */

export type PumpTradeSource = 'pump' | 'pumpportal' | 'alchemy';

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
  provider?: 'mock' | 'alchemy' | 'pumpportal';
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
  /** Optional bounded recovery (Alchemy). */
  reconcileAll?(reason?: string): Promise<{ recovered: number }>;
}
