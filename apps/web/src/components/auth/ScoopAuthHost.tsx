'use client';

import { useEffect, useState } from 'react';
import { ModalController, RouterController } from '@reown/appkit-controllers';
import { ScoopAuthSheet } from '@/components/auth/ScoopAuthSheet';
import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';
import { isApproveTransactionView } from '@/lib/auth/headless-secure-iframe';
import {
  closeScoopAuthSheet,
  getScoopConnectNamespace,
  subscribeScoopAuthSheet,
  type ScoopConnectNamespace,
} from '@/lib/auth/open-scoop-auth';
import { subscribeScoopAuthChanged } from '@/lib/auth/scoop-auth-events';

/**
 * Mounts the custom auth sheet when the feature flag is on.
 * Safe no-op when flag is off (production modal path).
 * Sheet open/close is owned by open-scoop-auth pub/sub (including dismiss settle).
 * Closes as completed only after a verified SCOOP SIWE session (signin event)
 * for the default eip155 Join path. Solana namespace settles on wallet connect.
 */
export function ScoopAuthHost() {
  const enabled = isScoopCustomAuthUiEnabled();
  const [open, setOpen] = useState(false);
  const [namespace, setNamespace] =
    useState<ScoopConnectNamespace>('eip155');

  useEffect(() => {
    if (!enabled) return;
    return subscribeScoopAuthSheet((nextOpen) => {
      setOpen(nextOpen);
      setNamespace(getScoopConnectNamespace());
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeScoopAuthChanged((detail) => {
      if (detail.reason !== 'signin') return;
      // Solana connect does not create a SIWE session.
      if (getScoopConnectNamespace() === 'solana') return;
      closeScoopAuthSheet({ outcome: 'completed' });
      setOpen(false);
    });
  }, [enabled]);

  if (!enabled) return null;

  return (
    <ScoopAuthSheet
      open={open}
      namespace={namespace}
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
