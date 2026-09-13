import { describe, expect, it } from 'vitest';
import { ZERO_ADDRESS } from '@scoop/shared';
import { watchlistAddLaunch, type Watchlist } from './watchlist.js';

const TOKEN_LOW = '0x1111111111111111111111111111111111111111';
const USDG = '0x5fc5360d00000000000000000000000000000000';
const POOL =
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

function emptyWatchlist(): Watchlist {
  return {
    tokens: new Map(),
    pools: new Map(),
    distributors: new Map(),
    holderVaults: new Map(),
    lockers: new Set(),
    tokenAddresses: [],
    distributorAddresses: [],
    holderVaultAddresses: [],
  };
}

describe('watchlist orientation', () => {
  it('stores sorted currencies when token sorts before ERC-20 quote', () => {
    const wl = emptyWatchlist();
    const entry = watchlistAddLaunch(wl, {
      chainId: 4663,
      tokenAddress: TOKEN_LOW,
      poolId: POOL,
      feeDistributorAddress: ZERO_ADDRESS,
      liquidityLockerAddress: ZERO_ADDRESS,
      quoteAsset: USDG,
      factoryAddress: ZERO_ADDRESS,
      deployerAddress: ZERO_ADDRESS,
      creatorId: '0x' + '11'.repeat(32),
      tickLower: -100,
      tickUpper: 100,
      openingSqrtPriceX96: '1',
      lpTokenId: '1',
      currency0: TOKEN_LOW,
      currency1: USDG,
      fee: 10000,
      tickSpacing: 10,
      hooks: ZERO_ADDRESS,
    });
    expect(entry.tokenIsCurrency1).toBe(false);
    expect(entry.currency0).toBe(TOKEN_LOW);
    expect(entry.currency1).toBe(USDG);
  });

  it('preserves ETH canary orientation (quote=currency0)', () => {
    const token = '0x2284ed0e4d446c6d78ac2d49a68bae822fd87373';
    const wl = emptyWatchlist();
    const entry = watchlistAddLaunch(wl, {
      chainId: 4663,
      tokenAddress: token,
      poolId: POOL,
      feeDistributorAddress: ZERO_ADDRESS,
      liquidityLockerAddress: ZERO_ADDRESS,
      quoteAsset: ZERO_ADDRESS,
      factoryAddress: ZERO_ADDRESS,
      deployerAddress: ZERO_ADDRESS,
      creatorId: '0x' + '22'.repeat(32),
      tickLower: -100,
      tickUpper: 100,
      openingSqrtPriceX96: '1',
      lpTokenId: '1',
      currency0: ZERO_ADDRESS,
      currency1: token,
      fee: 10000,
      tickSpacing: 10,
      hooks: ZERO_ADDRESS,
    });
    expect(entry.tokenIsCurrency1).toBe(true);
    expect(entry.currency0).toBe(ZERO_ADDRESS);
  });
});
