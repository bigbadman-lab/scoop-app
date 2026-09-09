'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { TokenDetail, TradeItem } from '@scoop/db';
import { recentTradesFromLiveWindow } from '@/lib/token/live-market';
import {
  createTokenMarketLivePoll,
  type TokenMarketLiveSnapshot,
} from '@/lib/token/token-market-live-poll';

export type TokenMarketLiveContextValue = {
  token: TokenDetail;
  /** Chronological ASC rolling window for PRICE. */
  tradesChronoAsc: TradeItem[];
  /** Newest-first bounded list for Recent Trades. */
  recentTrades: TradeItem[];
  tradesStatus: TokenMarketLiveSnapshot['tradesStatus'];
  tradesError: string | null;
  tradesApply: TokenMarketLiveSnapshot['tradesApply'];
  appendedTrades: TradeItem[];
  /** Immediate live refresh (Buy/Sell success, visibility restore). */
  refreshNow: () => void;
};

const TokenMarketLiveContext = createContext<TokenMarketLiveContextValue | null>(null);

type ProviderProps = {
  initialToken: TokenDetail;
  children: ReactNode;
};

/**
 * Single token-page live market layer — one ~2s poll owns metrics + trades head.
 */
export function TokenMarketLiveProvider({ initialToken, children }: ProviderProps) {
  const initialRef = useRef(initialToken);
  const [snap, setSnap] = useState<TokenMarketLiveSnapshot>(() => ({
    token: initialToken,
    tradesChronoAsc: [],
    tradesApply: 'unchanged',
    appendedTrades: [],
    tradesStatus: 'loading',
    tradesError: null,
  }));
  const pollRef = useRef<ReturnType<typeof createTokenMarketLivePoll> | null>(null);

  useEffect(() => {
    const seed = initialRef.current;
    const poll = createTokenMarketLivePoll({
      tokenAddress: seed.tokenAddress,
      initialToken: seed,
      onSnapshot: setSnap,
    });
    pollRef.current = poll;
    poll.start();
    return () => {
      poll.stop();
      pollRef.current = null;
    };
  }, [initialToken.tokenAddress]);

  const refreshNow = useMemo(
    () => () => {
      pollRef.current?.refreshNow();
    },
    [],
  );

  const value = useMemo<TokenMarketLiveContextValue>(() => {
    return {
      token: snap.token,
      tradesChronoAsc: snap.tradesChronoAsc,
      recentTrades: recentTradesFromLiveWindow(snap.tradesChronoAsc),
      tradesStatus: snap.tradesStatus,
      tradesError: snap.tradesError,
      tradesApply: snap.tradesApply,
      appendedTrades: snap.appendedTrades,
      refreshNow,
    };
  }, [snap, refreshNow]);

  return (
    <TokenMarketLiveContext.Provider value={value}>{children}</TokenMarketLiveContext.Provider>
  );
}

export function useTokenMarketLive(): TokenMarketLiveContextValue {
  const ctx = useContext(TokenMarketLiveContext);
  if (!ctx) {
    throw new Error('useTokenMarketLive must be used within TokenMarketLiveProvider');
  }
  return ctx;
}

/** Optional access when a child may render outside the provider in tests. */
export function useTokenMarketLiveOptional(): TokenMarketLiveContextValue | null {
  return useContext(TokenMarketLiveContext);
}
