'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  hasWagmiReconnectHint,
  scoopReownConfigured,
} from '@/lib/auth/reown-public';

export type WalletOpenIntent = 'connect' | 'account' | null;

type WalletShellValue = {
  configured: boolean;
  runtimeReady: boolean;
  activating: boolean;
  cookies: string | null;
  ensureRuntime: (intent?: WalletOpenIntent) => Promise<void>;
  takePendingIntent: () => WalletOpenIntent;
};

const WalletShellContext = createContext<WalletShellValue>({
  configured: false,
  runtimeReady: false,
  activating: false,
  cookies: null,
  ensureRuntime: async () => {},
  takePendingIntent: () => null,
});

export function useWalletShell(): WalletShellValue {
  return useContext(WalletShellContext);
}

/** Compat for callers that only need configured. */
export function useReownConfig(): { configured: boolean } {
  const { configured } = useWalletShell();
  return { configured };
}

type Props = {
  children: ReactNode;
  cookies: string | null;
};

type RuntimeModule = {
  WalletRuntimeProviders: (props: {
    children: ReactNode;
    cookies: string | null;
    onRuntimeReady?: () => void;
  }) => ReactNode;
};

/**
 * Lightweight public-shell provider: no AppKit/Wagmi imports.
 * Dynamically loads WalletRuntimeProviders only after Connect / reconnect hint.
 */
export function WalletShellProvider({ children, cookies }: Props) {
  const configured = scoopReownConfigured;
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [activating, setActivating] = useState(false);
  const [Runtime, setRuntime] = useState<RuntimeModule | null>(null);
  const pendingIntentRef = useRef<WalletOpenIntent>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);
  const providersMountedRef = useRef(false);
  const mountWaitersRef = useRef<Array<() => void>>([]);

  const onProvidersMounted = useCallback(() => {
    providersMountedRef.current = true;
    const waiters = mountWaitersRef.current;
    mountWaitersRef.current = [];
    for (const w of waiters) w();
  }, []);

  const waitForProvidersMounted = useCallback(async () => {
    if (providersMountedRef.current) return;
    await new Promise<void>((resolve) => {
      mountWaitersRef.current.push(resolve);
    });
  }, []);

  const ensureRuntime = useCallback(
    async (intent: WalletOpenIntent = null) => {
      if (!configured) return;
      if (intent) pendingIntentRef.current = intent;

      if (!loadPromiseRef.current) {
        setActivating(true);
        loadPromiseRef.current = (async () => {
          const mod = await import('@/components/auth/WalletRuntimeProviders');
          setRuntime(mod);
          setRuntimeReady(true);
          await waitForProvidersMounted();
          setActivating(false);
        })().catch((err) => {
          loadPromiseRef.current = null;
          setActivating(false);
          throw err;
        });
      }

      await loadPromiseRef.current;
    },
    [configured, waitForProvidersMounted],
  );

  const takePendingIntent = useCallback((): WalletOpenIntent => {
    const intent = pendingIntentRef.current;
    pendingIntentRef.current = null;
    return intent;
  }, []);

  useEffect(() => {
    if (!configured || runtimeReady) return;
    const browserCookies =
      typeof document !== 'undefined' ? document.cookie : cookies;
    if (hasWagmiReconnectHint(browserCookies) || hasWagmiReconnectHint(cookies)) {
      void ensureRuntime(null);
    }
  }, [configured, cookies, runtimeReady, ensureRuntime]);

  const value = useMemo(
    () => ({
      configured,
      runtimeReady,
      activating,
      cookies,
      ensureRuntime,
      takePendingIntent,
    }),
    [configured, runtimeReady, activating, cookies, ensureRuntime, takePendingIntent],
  );

  const tree =
    runtimeReady && Runtime ? (
      <Runtime.WalletRuntimeProviders
        cookies={cookies}
        onRuntimeReady={onProvidersMounted}
      >
        {children}
      </Runtime.WalletRuntimeProviders>
    ) : (
      children
    );

  return (
    <WalletShellContext.Provider value={value}>{tree}</WalletShellContext.Provider>
  );
}

export { WalletShellProvider as AuthProviders };
