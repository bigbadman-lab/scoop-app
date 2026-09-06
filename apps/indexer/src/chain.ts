import { defineChain } from 'viem';
import type { IndexerConfig } from './config.js';

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.chain.robinhood.com'],
    },
  },
});

export function resolveRpcUrls(config: IndexerConfig): string[] {
  const urls = [config.ROBINHOOD_RPC_URL, config.ROBINHOOD_FALLBACK_RPC_URL].filter(
    (url): url is string => Boolean(url),
  );
  return [...new Set(urls)];
}

export function createChainDefinition(config: IndexerConfig) {
  const http = resolveRpcUrls(config);
  const webSocket = config.ROBINHOOD_WS_URL ? [config.ROBINHOOD_WS_URL] : undefined;

  return defineChain({
    ...robinhoodChain,
    rpcUrls: {
      default: {
        http,
        webSocket,
      },
    },
  });
}
