/**
 * Generic post-completion HTTP poll loop (token-page pattern).
 * No overlap; pauses while document.hidden; refreshes immediately when visible again.
 */

export type CreateLivePollOptions<T> = {
  pollMs: number;
  initial: T;
  /**
   * Fetch the next snapshot. Return `null` on transient failure to keep the last good state.
   */
  fetchSnapshot: (ctx: { signal: AbortSignal }) => Promise<T | null>;
  onSnapshot: (data: T) => void;
  isDocumentHidden?: () => boolean;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  addVisibilityListener?: (listener: () => void) => () => void;
};

export function createLivePoll<T>(options: CreateLivePollOptions<T>): {
  start: () => void;
  stop: () => void;
  refreshNow: () => void;
  getSnapshot: () => T;
} {
  const pollMs = options.pollMs;
  const isHidden =
    options.isDocumentHidden ??
    (() => (typeof document !== 'undefined' ? document.hidden : false));
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  let snapshot = options.initial;
  let stopped = true;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ac: AbortController | null = null;
  let removeVisibility: (() => void) | null = null;
  let generation = 0;

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

  async function runCycle() {
    if (stopped || inFlight) return;

    inFlight = true;
    const myGen = generation;
    ac?.abort();
    ac = new AbortController();
    const signal = ac.signal;

    try {
      const next = await options.fetchSnapshot({ signal });
      if (stopped || myGen !== generation) return;
      if (next != null) {
        snapshot = next;
        options.onSnapshot(snapshot);
      }
    } finally {
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
    generation += 1;
    clearTimer();
    inFlight = false;
    ac?.abort();
    void runCycle();
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
    options.onSnapshot(snapshot);
    void runCycle();

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
    getSnapshot: () => snapshot,
  };
}
