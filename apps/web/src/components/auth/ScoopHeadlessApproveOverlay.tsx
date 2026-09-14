'use client';

import { useEffect, useState } from 'react';
import {
  ConnectorController,
  ModalController,
  RouterController,
  ThemeController,
} from '@reown/appkit-controllers';
import {
  hideW3mSecureIframe,
  isApproveTransactionView,
  showW3mSecureIframe,
} from '@/lib/auth/headless-secure-iframe';
import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';

/**
 * When Reown runs headless, AppKit still opens ModalController on unsafe RPC
 * (personal_sign / SIWE) but never injects ApproveTransaction UI — so the
 * secure iframe stays hidden and Join stalls on Confirming.
 *
 * This host mirrors ApproveTransaction: show `#w3m-iframe` whenever the
 * controller routes to ApproveTransaction while the modal is "open".
 */
export function ScoopHeadlessApproveOverlay() {
  const enabled = isScoopCustomAuthUiEnabled();
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let showTimer: number | null = null;

    function clearShowTimer() {
      if (showTimer != null) {
        window.clearTimeout(showTimer);
        showTimer = null;
      }
    }

    async function syncTheme() {
      const authConnector = ConnectorController.getAuthConnector() as
        | { provider?: { syncTheme?: (payload: unknown) => Promise<void> } }
        | undefined;
      const provider = authConnector?.provider;
      if (!provider?.syncTheme) return;
      try {
        const theme = ThemeController.getSnapshot();
        await provider.syncTheme({
          themeMode: theme.themeMode,
          themeVariables: theme.themeVariables,
        });
      } catch {
        // Theme sync is best-effort; signing UI still works without it.
      }
    }

    function sync() {
      const open = ModalController.state.open;
      const view = RouterController.state.view;
      const shouldShow = open && isApproveTransactionView(view);
      setActive(shouldShow);
      clearShowTimer();
      if (shouldShow) {
        void syncTheme();
        // Retry briefly — iframe may mount a tick after AUTH connect.
        let attempts = 0;
        const tick = () => {
          if (showW3mSecureIframe()) return;
          attempts += 1;
          if (attempts < 20) {
            showTimer = window.setTimeout(tick, 100);
          }
        };
        tick();
      } else {
        hideW3mSecureIframe();
      }
    }

    sync();
    const unsubOpen = ModalController.subscribeKey('open', () => sync());
    const unsubView = RouterController.subscribeKey('view', () => sync());
    const onResize = () => {
      if (
        ModalController.state.open &&
        isApproveTransactionView(RouterController.state.view)
      ) {
        showW3mSecureIframe();
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      clearShowTimer();
      unsubOpen();
      unsubView();
      window.removeEventListener('resize', onResize);
      hideW3mSecureIframe();
    };
  }, [enabled]);

  if (!enabled || !active) return null;

  return (
    <div
      className="fixed inset-0 z-[10065] flex items-end justify-center bg-black/50 sm:items-center"
      data-testid="scoop-headless-approve-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scoop-headless-approve-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Dismiss sign-in confirmation"
        onClick={() => {
          ModalController.close();
        }}
      />
      <div className="pointer-events-none relative z-[1] mb-[min(620px,92dvh)] w-full max-w-[360px] px-4 pb-3 sm:mb-0 sm:pb-[620px]">
        <div className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 shadow-md">
          <p
            id="scoop-headless-approve-title"
            className="font-mono text-[13px] font-semibold tracking-tight text-[var(--fg)]"
          >
            Confirm sign in
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Approve the message in the secure prompt to finish signing in to
            SCOOP.
          </p>
        </div>
      </div>
    </div>
  );
}
