'use client';

import { useAppKitState } from '@reown/appkit/react';
import { useEffect, useState } from 'react';
import {
  EMAIL_DEVICE_APPROVAL_BODY_LINES,
  EMAIL_DEVICE_APPROVAL_STATUS,
  EMAIL_DEVICE_APPROVAL_TITLE,
  EMAIL_OTP_HELPER_BODY_LINES,
  EMAIL_OTP_HELPER_STATUS,
  EMAIL_OTP_HELPER_TITLE,
  resolveEmailLoginHelperPhase,
} from '@/lib/auth/email-device-approval';
import { startAppKitEmailModalLayoutWatch } from '@/lib/auth/repair-appkit-router-height';
import { subscribeScoopAuthChanged } from '@/lib/auth/scoop-auth-events';
import { subscribeAppKitRouterView } from '@/lib/auth/subscribe-appkit-router-view';

/**
 * Lightweight SCOOP helper shown above Reown while email device approval / OTP is active.
 * Does not replace AppKit markup or own resend/OTP inputs.
 */
export function EmailDeviceApprovalHelper() {
  const { open: modalOpen } = useAppKitState();
  const [appKitView, setAppKitView] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    return subscribeAppKitRouterView((view) => {
      setAppKitView(view);
    });
  }, []);

  useEffect(() => {
    return subscribeScoopAuthChanged((detail) => {
      if (detail.reason === 'signin') {
        setAuthenticated(true);
        return;
      }
      if (detail.reason === 'signout') {
        setAuthenticated(false);
      }
    });
  }, []);

  const phase = resolveEmailLoginHelperPhase({
    appKitView,
    modalOpen,
    authenticated,
  });

  // Repair AppKit router height collapse on email verify views (header-only modal).
  useEffect(() => {
    if (!phase) return;
    return startAppKitEmailModalLayoutWatch();
  }, [phase]);

  if (!phase) return null;

  const title =
    phase === 'device' ? EMAIL_DEVICE_APPROVAL_TITLE : EMAIL_OTP_HELPER_TITLE;
  const bodyLines =
    phase === 'device'
      ? EMAIL_DEVICE_APPROVAL_BODY_LINES
      : EMAIL_OTP_HELPER_BODY_LINES;
  const status =
    phase === 'device' ? EMAIL_DEVICE_APPROVAL_STATUS : EMAIL_OTP_HELPER_STATUS;

  return (
    <aside
      data-scoop-email-device-approval="true"
      data-scoop-email-login-phase={phase}
      className="pointer-events-none fixed inset-x-4 top-[calc(var(--announcement-offset,0px)+4.75rem)] z-[10050] mx-auto w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3.5 text-left shadow-md md:inset-x-auto md:right-6 md:mx-0 lg:right-8"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="font-mono text-[13px] font-semibold tracking-tight text-[var(--fg)]">
        {title}
      </p>
      <div className="mt-1.5 space-y-0.5 font-mono text-[12px] leading-snug text-[var(--muted)]">
        {bodyLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--muted-2)]">
        {status}
      </p>
    </aside>
  );
}
