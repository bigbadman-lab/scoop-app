import type { TokenDetail, TradeItem } from '@scoop/db';
import { TRADES_CHART_SEED_LIMIT } from '@/lib/token/chart-ranges';
import { fetchTokenDetail } from '@/lib/token/fetch-token-detail';
import { clearTradeCache, fetchTokenTrades } from '@/lib/token/fetch-trades';
import {
  TOKEN_MARKET_LIVE_POLL_MS,
  applyLiveTradePoll,
  liveTokenFingerprint,
  mergeLiveToken,
  tradesFingerprint,
  type LiveTradePollResult,
} from '@/lib/token/live-market';

export type TokenMarketLiveSnapshot = {
  token: TokenDetail;
  tradesChronoAsc: TradeItem[];
  tradesApply: LiveTradePollResult['apply'];
  appendedTrades: TradeItem[];
  tradesStatus: 'loading' | 'ready' | 'empty' | 'error';
  tradesError: string | null;
};

export type TokenMarketLivePollOptions = {
  tokenAddress: string;
  initialToken: TokenDetail;
  pollMs?: number;
  tradesLimit?: number;
  onSnapshot: (snapshot: TokenMarketLiveSnapshot) => void;
  fetchDetail?: typeof fetchTokenDetail;
  fetchTrades?: typeof fetchTokenTrades;
  clearTradesCache?: typeof clearTradeCache;
  isDocumentHidden?: () => boolean;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  addVisibilityListener?: (listener: () => void) => () => void;
};

/**
 * One coordinated token-page poll loop (no React).
 * setTimeout-after-completion prevents overlap; visibility pauses; restore refreshes immediately.
 */
export function createTokenMarketLivePoll(options: TokenMarketLivePollOptions): {
  start: () => void;
  stop: () => void;
  refreshNow: () => void;
  getSnapshot: () => TokenMarketLiveSnapshot;
} {
  const pollMs = options.pollMs ?? TOKEN_MARKET_LIVE_POLL_MS;
  const tradesLimit = options.tradesLimit ?? TRADES_CHART_SEED_LIMIT;
  const fetchDetail = options.fetchDetail ?? fetchTokenDetail;
  const fetchTradesFn = options.fetchTrades ?? fetchTokenTrades;
  const clearTradesCache = options.clearTradesCache ?? clearTradeCache;
  const isHidden =
    options.isDocumentHidden ??
    (() => (typeof document !== 'undefined' ? document.hidden : false));
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  let token = options.initialToken;
  let tradesChronoAsc: TradeItem[] = [];
  let tradesStatus: TokenMarketLiveSnapshot['tradesStatus'] = 'loading';
  let tradesError: string | null = null;
  let lastEmittedTokenFp = liveTokenFingerprint(token);
  let lastEmittedTradesFp = '';
  let lastEmittedStatus: TokenMarketLiveSnapshot['tradesStatus'] = 'loading';
  let stopped = true;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ac: AbortController | null = null;
  let removeVisibility: (() => void) | null = null;
  let generation = 0;

  function snapshot(
    apply: LiveTradePollResult['apply'] = 'unchanged',
    appended: TradeItem[] = [],
  ): TokenMarketLiveSnapshot {
    return {
      token,
      tradesChronoAsc,
      tradesApply: apply,
      appendedTrades: appended,
      tradesStatus,
      tradesError,
    };
  }

  function emit(apply: LiveTradePollResult['apply'], appended: TradeItem[]) {
    lastEmittedTokenFp = liveTokenFingerprint(token);
    lastEmittedTradesFp = tradesFingerprint(tradesChronoAsc);
    lastEmittedStatus = tradesStatus;
    options.onSnapshot(snapshot(apply, appended));
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function scheduleNext() {
    clearTimer();
    if (stopped) return;
    if (isHidden()) return;
    timer = setTimeoutFn(() => {
      timer = null;
      void runCycle();
    }, pollMs);
  }

  async function runCycle(opts?: { forceEmit?: boolean; bypassCache?: boolean }) {
    if (stopped || inFlight) return;

    inFlight = true;
    const myGen = generation;
    ac?.abort();
    ac = new AbortController();
    const signal = ac.signal;

    let apply: LiveTradePollResult['apply'] = 'unchanged';
    let appended: TradeItem[] = [];

    try {
      const [detailResult, tradesResult] = await Promise.all([
        fetchDetail({
          tokenAddress: options.tokenAddress,
          signal,
        }),
        fetchTradesFn({
          tokenAddress: options.tokenAddress,
          limit: tradesLimit,
          signal,
          bypassCache: opts?.bypassCache ?? true,
        }),
      ]);

      if (stopped || myGen !== generation) return;

      if (detailResult.ok) {
        token = mergeLiveToken(token, detailResult.token).token;
      }

      if (tradesResult.ok) {
        const applied = applyLiveTradePoll({
          existingChronoAsc: tradesChronoAsc,
          incomingNewestFirst: tradesResult.items,
        });
        tradesChronoAsc = applied.tradesChronoAsc;
        apply = applied.apply;
        appended = applied.appended;
        tradesError = null;
        tradesStatus = tradesChronoAsc.length === 0 ? 'empty' : 'ready';
      } else if (tradesResult.error !== 'aborted') {
        // Preserve last good trades; only surface error before first success.
        if (tradesStatus === 'loading') {
          tradesStatus = 'error';
          tradesError = tradesResult.error;
        }
      }

      const tokenFp = liveTokenFingerprint(token);
      const tradesFp = tradesFingerprint(tradesChronoAsc);
      const changed =
        opts?.forceEmit ||
        tokenFp !== lastEmittedTokenFp ||
        tradesFp !== lastEmittedTradesFp ||
        tradesStatus !== lastEmittedStatus;

      if (changed) {
        emit(apply, appended);
      }
    } finally {
      // Only the active generation owns inFlight / scheduling (aborted cycles must not clobber).
      if (myGen === generation) {
        inFlight = false;
        if (!stopped) {
          scheduleNext();
        }
      }
    }
  }

  function refreshNow() {
    if (stopped) return;
    clearTradesCache();
    generation += 1;
    clearTimer();
    // Drop inFlight so an immediate refresh can run even if a cycle is mid-flight.
    inFlight = false;
    ac?.abort();
    void runCycle({ bypassCache: true, forceEmit: false });
  }

  function onVisibility() {
    if (stopped) return;
    if (isHidden()) {
      clearTimer();
      return;
    }
    refreshNow();
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    generation += 1;
    emit('unchanged', []);
    void runCycle({ bypassCache: true });

    if (options.addVisibilityListener) {
      removeVisibility = options.addVisibilityListener(onVisibility);
    } else if (typeof document !== 'undefined') {
      const listener = () => onVisibility();
      document.addEventListener('visibilitychange', listener);
      removeVisibility = () => document.removeEventListener('visibilitychange', listener);
    }
  }

  function stop() {
    stopped = true;
    generation += 1;
    clearTimer();
    ac?.abort();
    ac = null;
    removeVisibility?.();
    removeVisibility = null;
    inFlight = false;
  }

  return {
    start,
    stop,
    refreshNow,
    getSnapshot: () => snapshot(),
  };
}
