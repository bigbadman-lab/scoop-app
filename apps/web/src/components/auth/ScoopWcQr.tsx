'use client';

import encodeQR from '@paulmillr/qr';
import { useMemo } from 'react';

type Props = {
  uri: string;
  size?: number;
};

/**
 * Small WalletConnect QR using an existing transitive QR encoder
 * promoted to a direct dependency (@paulmillr/qr).
 */
export function ScoopWcQr({ uri, size = 220 }: Props) {
  const svg = useMemo(() => {
    try {
      return encodeQR(uri, 'svg', { ecc: 'medium', scale: 4, border: 2 });
    } catch {
      return null;
    }
  }, [uri]);

  if (!svg) {
    return (
      <p className="font-mono text-[11px] text-[var(--muted)]">
        Could not render QR. Use copy URI or open wallet.
      </p>
    );
  }

  return (
    <div
      className="mx-auto overflow-hidden rounded-[var(--radius-md)] bg-white p-2"
      style={{ width: size, height: size }}
      aria-label="WalletConnect QR code"
      // SVG from @paulmillr/qr is a trusted local encode of the WC URI.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
