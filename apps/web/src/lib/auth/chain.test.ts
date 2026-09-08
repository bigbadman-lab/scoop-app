import { describe, expect, it } from 'vitest';
import {
  ROBINHOOD_CHAIN_ID,
} from '@/lib/brand';
import { APPKIT_ICON_DATA_URI } from '@/lib/auth/appkit-icon-data-uri';
import {
  buildAppKitMetadata,
  getReownProjectId,
  isReownConfigured,
  resolveAppKitMetadataIcons,
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

  it('uses localhost metadata.url in development with embedded icon', () => {
    expect(
      resolveAppKitMetadataUrl({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
    ).toBe('http://localhost:3000');
    const meta = buildAppKitMetadata({
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(meta.url).toBe('http://localhost:3000');
    expect(meta.icons[0]).toBe(APPKIT_ICON_DATA_URI);
    expect(meta.icons[0]).toMatch(/^data:image\/png;base64,/);
    expect(meta.description).toMatch(/not payments/i);
  });

  it('uses canonical origin in production unless overridden', () => {
    expect(
      resolveAppKitMetadataUrl({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    ).toBe('https://scoop.fun');
    expect(
      resolveAppKitMetadataUrl({
        NODE_ENV: 'production',
        NEXT_PUBLIC_APP_ORIGIN: 'https://www.scoop.fun/',
      } as NodeJS.ProcessEnv),
    ).toBe('https://www.scoop.fun');
  });

  it('resolves AppKit icons via data URI or HTTPS override', () => {
    expect(resolveAppKitMetadataIcons({} as NodeJS.ProcessEnv)).toEqual([
      APPKIT_ICON_DATA_URI,
    ]);
    expect(
      resolveAppKitMetadataIcons({
        NEXT_PUBLIC_APPKIT_ICON_URL: ' https://cdn.example/scoop.png ',
      } as NodeJS.ProcessEnv),
    ).toEqual(['https://cdn.example/scoop.png']);
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
