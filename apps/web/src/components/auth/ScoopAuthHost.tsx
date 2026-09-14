'use client';

import { useEffect, useState } from 'react';
import { ModalController, RouterController } from '@reown/appkit-controllers';
import { ScoopAuthSheet } from '@/components/auth/ScoopAuthSheet';
import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';
import { isApproveTransactionView } from '@/lib/auth/headless-secure-iframe';
import {
  closeScoopAuthSheet,
  subscribeScoopAuthSheet,
} from '@/lib/auth/open-scoop-auth';
import { subscribeScoopAuthChanged } from '@/lib/auth/scoop-auth-events';

/**
 * Mounts the custom auth sheet when the feature flag is on.
 * Safe no-op when flag is off (production modal path).
 * Sheet open/close is owned by open-scoop-auth pub/sub (including dismiss settle).
 * Closes as completed only after a verified SCOOP SIWE session (signin event).
 */
export function ScoopAuthHost() {
  const enabled = isScoopCustomAuthUiEnabled();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return subscribeScoopAuthSheet(setOpen);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeScoopAuthChanged((detail) => {
      if (detail.reason !== 'signin') return;
      closeScoopAuthSheet({ outcome: 'completed' });
      setOpen(false);
    });
  }, [enabled]);

  if (!enabled) return null;

  return (
    <ScoopAuthSheet
      open={open}
      onClose={() => {
        // Dismiss while ApproveTransaction is open → reject the pending sign.
        if (
          ModalController.state.open &&
          isApproveTransactionView(RouterController.state.view)
        ) {
          ModalController.close();
        }
        setOpen(false);
      }}
    />
  );
}
