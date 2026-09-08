'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { AuthInterruptLive } from '@/components/auth/AuthInterruptLive';
import { fetchScoopAuthStatus } from '@/lib/auth/siwe-session-client';
import {
  launchAssistAuthMessage,
  launchAssistRequiresSiwe,
  resolveScoopAuthState,
  type ScoopAuthReconciliationState,
} from '@/lib/auth/reconciliation';
import type { AssistAuthGateProps } from '@/components/auth/AssistAuthGate';

/**
 * Heavy reconciler — wagmi account + scoop_session.
 * Same-wallet reconnect → ready without SIWE.
 * Different wallet → require SIWE before assist proceeds.
 */
export function AssistAuthGateLive({
  resumePath,
  onReady,
  onCancel,
  onBlocked,
  visible = true,
}: AssistAuthGateProps) {
  const { address, isConnected, status } = useAccount();
  const [phase, setPhase] = useState<'checking' | 'need_siwe' | 'ready'>('checking');
  const [authState, setAuthState] = useState<ScoopAuthReconciliationState | null>(null);
  const readyOnce = useRef(false);

  const refresh = useCallback(async () => {
    const session = await fetchScoopAuthStatus();
    const connected =
      status === 'connected' && isConnected && typeof address === 'string';
    const next = resolveScoopAuthState({
      sessionAuthenticated: session.authenticated,
      sessionAddress: session.authenticated ? session.address : null,
      connected,
      connectedAddress: connected ? address : null,
    });
    setAuthState(next);

    if (launchAssistRequiresSiwe(next)) {
      if (readyOnce.current) {
        readyOnce.current = false;
        onBlocked?.();
      }
      setPhase('need_siwe');
      return;
    }

    setPhase('ready');
    if (!readyOnce.current) {
      readyOnce.current = true;
      onReady();
    }
  }, [address, isConnected, status, onReady, onBlocked]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (phase === 'checking') {
    if (!visible) return null;
    return (
      <div className="mx-auto flex min-h-[40vh] max-w-xl items-center justify-center px-4 py-16">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)] motion-safe:animate-pulse">
          Checking wallet session…
        </p>
      </div>
    );
  }

  if (phase === 'need_siwe') {
    return (
      <AuthInterruptLive
        resumePath={resumePath}
        mismatch={authState === 'wallet_mismatch'}
        message={launchAssistAuthMessage(authState ?? 'signed_out')}
        onCancel={onCancel}
        onAuthenticated={() => {
          readyOnce.current = false;
          void refresh();
        }}
      />
    );
  }

  // Ready — parent shows the assist flow; stay mounted for wallet-change refresh.
  return null;
}
