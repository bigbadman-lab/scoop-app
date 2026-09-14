'use client';

import { useEffect, useState } from 'react';
import { ScoopAuthSheet } from '@/components/auth/ScoopAuthSheet';
import { isScoopCustomAuthUiEnabled } from '@/lib/auth/custom-auth-ui';
import {
  closeScoopAuthSheet,
  subscribeScoopAuthSheet,
} from '@/lib/auth/open-scoop-auth';

/**
 * Mounts the custom auth sheet when the feature flag is on.
 * Safe no-op when flag is off (production modal path).
 */
export function ScoopAuthHost() {
  const enabled = isScoopCustomAuthUiEnabled();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    return subscribeScoopAuthSheet(setOpen);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <ScoopAuthSheet
      open={open}
      onClose={() => {
        closeScoopAuthSheet();
        setOpen(false);
      }}
    />
  );
}
