'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useAppKitAccount } from '@reown/appkit/react';
import { AuthInterruptLive } from '@/components/auth/AuthInterruptLive';
import { fetchScoopAuthStatus } from '@/lib/auth/siwe-session-client';
import {
  launchAssistAuthMessage,
  launchAssistAuthTitle,
  launchAssistMayProceed,
  resolveScoopAuthState,
  type ScoopAuthReconciliationState,
} from '@/lib/auth/reconciliation';
import type { AssistAuthGateProps } from '@/components/auth/AssistAuthGate';

/**
 * Heavy reconciler — authenticated SCOOP session + matching live wallet.
 * EVM sessions reconcile against wagmi; Solana sessions against AppKit solana.
 * Launch-assist proceeds only on authenticated_match.
 */
export function AssistAuthGateLive({
  resumePath,
  onReady,
  onCancel,
  onBlocked,
  visible = true,
}: AssistAuthGateProps) {
  const {
    address: evmAddress,
    isConnected: evmIsConnected,
    status: evmStatus,
  } = useAccount();
  const solanaAccount = useAppKitAccount({ namespace: 'solana' });
  const [phase, setPhase] = useState<'checking' | 'blocked' | 'ready'>('checking');
  const [authState, setAuthState] = useState<ScoopAuthReconciliationState | null>(
    null,
  );
  const readyOnce = useRef(false);

  const refresh = useCallback(async () => {
    const session = await fetchScoopAuthStatus();

    const solConnected =
      Boolean(solanaAccount.isConnected) &&
      typeof solanaAccount.address === 'string' &&
      solanaAccount.address.length > 0;
    const evmConnected =
      evmStatus === 'connected' &&
      evmIsConnected &&
      typeof evmAddress === 'string' &&
      evmAddress.length > 0;

    let connected = false;
    let connectedAddress: string | null = null;

    if (session.authenticated && session.namespace === 'solana') {
      connected = solConnected;
      connectedAddress = solConnected ? solanaAccount.address! : null;
    } else if (session.authenticated && session.namespace === 'eip155') {
      connected = evmConnected;
      connectedAddress = evmConnected ? evmAddress! : null;
    } else if (solConnected) {
      connected = true;
      connectedAddress = solanaAccount.address!;
    } else if (evmConnected) {
      connected = true;
      connectedAddress = evmAddress!;
    }

    const next = resolveScoopAuthState({
      sessionAuthenticated: session.authenticated,
      sessionAddress: session.authenticated ? session.address : null,
      connected,
      connectedAddress,
    });
    setAuthState(next);

    if (!launchAssistMayProceed(next)) {
      if (readyOnce.current) {
        readyOnce.current = false;
        onBlocked?.();
      }
      setPhase('blocked');
      return;
    }

    setPhase('ready');
    if (!readyOnce.current) {
      readyOnce.current = true;
      onReady();
    }
  }, [
    evmAddress,
    evmIsConnected,
    evmStatus,
    solanaAccount.address,
    solanaAccount.isConnected,
    onReady,
    onBlocked,
  ]);

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

  if (phase === 'blocked') {
    const state = authState ?? 'signed_out';
    return (
      <AuthInterruptLive
        resumePath={resumePath}
        mismatch={state === 'wallet_mismatch'}
        title={launchAssistAuthTitle(state)}
        message={launchAssistAuthMessage(state)}
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
