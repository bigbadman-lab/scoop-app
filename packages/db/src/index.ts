export { createPool, createClient, withTransaction, createDbClient, query } from './client.js';
export { normalizeAddress, normalizeBytes32, toNumericString } from './hex.js';
export type {
  DatabaseClientMode,
  ScoopDbClient,
  ScoopDbConfig,
  Queryable,
  Pool,
  PoolClient,
  Client,
} from './types.js';

export { upsertRawChainEvent, type RawChainEventRow } from './repos/raw-chain-events.js';
export { upsertLaunch, type LaunchRow } from './repos/launches.js';
export { upsertToken, type TokenRow } from './repos/tokens.js';
export { upsertCreator, type CreatorRow } from './repos/creators.js';
export { upsertPool, type PoolRow } from './repos/pools.js';
export { upsertTrade, type TradeRow } from './repos/trades.js';
export { upsertTransfer, type TransferRow } from './repos/transfers.js';
export {
  upsertHolderBalance,
  deleteHolderBalance,
  type HolderBalanceRow,
} from './repos/holder-balances.js';
export {
  upsertTokenMarketState,
  type TokenMarketStateRow,
} from './repos/token-market-state.js';
export { upsertCandle, type CandleRow } from './repos/candles.js';
export {
  upsertIndexerCheckpoint,
  type IndexerCheckpointRow,
} from './repos/indexer-checkpoints.js';
export { upsertIndexerHealth, type IndexerHealthRow } from './repos/indexer-health.js';
export {
  upsertAddressClassification,
  type AddressClassificationRow,
} from './repos/address-classifications.js';
