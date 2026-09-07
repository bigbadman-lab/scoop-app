import { describe, expect, it } from 'vitest';
import {
  ROBINHOOD_CHAIN_ID,
} from '@/lib/brand';
import {
  buildAppKitMetadata,
  getReownProjectId,
  isReownConfigured,
  resolveAppKitMetadataUrl,
  resolveRobinhoodPublicRpc,
  robinhoodAppKitChain,
  shortenWalletAddress,
} from '@/lib/auth/chain';

describe('auth chain / AppKit metadata', () => {
  it('defines Robinhood Chain 4663 for AppKit', () => {
    expect(ROBINHOOD_CHAIN_ID).toBe(4663);
    expect(robinhoodAppKitChain.id).toBe(4663);
    expect(robinhoodAppKitChain.caipNetworkId).toBe('eip155:4663');
    expect(robinhoodAppKitChain.nativeCurrency.symbol).toBe('ETH');
    expect(robinhoodAppKitChain.rpcUrls.default.http.length).toBeGreaterThan(0);
  });

  it('uses localhost metadata.url in development', () => {
    expect(
      resolveAppKitMetadataUrl({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toBe('http://localhost:3000');
    const meta = buildAppKitMetadata({
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(meta.url).toBe('http://localhost:3000');
    expect(meta.icons[0]).toBe('http://localhost:3000/brand/MARK.png');
  });

  it('uses canonical origin in production unless overridden', () => {
    expect(
      resolveAppKitMetadataUrl({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toBe('https://scoop.market');
    expect(
      resolveAppKitMetadataUrl({
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_ORIGIN: 'https://www.scoop.market/',
      } as NodeJS.ProcessEnv),
    ).toBe('https://www.scoop.market');
  });

  it('never prefers server-only RPC env for public AppKit RPC', () => {
    expect(
      resolveRobinhoodPublicRpc({
        ROBINHOOD_RPC_URL: 'https://secret.example/rpc',
        ROBINHOOD_FALLBACK_RPC_URL: 'https://fallback.example/rpc',
      } as NodeJS.ProcessEnv),
    ).toBe('https://rpc.mainnet.chain.robinhood.com');
    expect(
      resolveRobinhoodPublicRpc({
        NEXT_PUBLIC_ROBINHOOD_RPC_URL: 'https://public.example/rpc',
      } as NodeJS.ProcessEnv),
    ).toBe('https://public.example/rpc');
  });

  it('reports Reown configuration from project id presence only', () => {
    expect(isReownConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isReownConfigured({
        NEXT_PUBLIC_REOWN_PROJECT_ID: '  abc  ',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('getReownProjectId with explicit env does not require ambient process.env', () => {
    expect(
      getReownProjectId({
        NEXT_PUBLIC_REOWN_PROJECT_ID: '',
      } as NodeJS.ProcessEnv),
    ).toBe('');
    expect(
      getReownProjectId({
        NEXT_PUBLIC_REOWN_PROJECT_ID: ' pid ',
      } as NodeJS.ProcessEnv),
    ).toBe('pid');
  });

  it('shortens wallet addresses for chrome', () => {
    expect(shortenWalletAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(
      '0xd8dA…6045',
    );
  });
});
