'use client';

import { useEffect, useState } from 'react';
import { formatNewsAge } from '@/lib/format';

type Props = {
  iso: string;
  className?: string;
};

/** Client-side news age so SSR/CSR clocks do not fight. */
export function NewsAge({ iso, className }: Props) {
  const [label, setLabel] = useState(() => formatNewsAge(iso));

  useEffect(() => {
    const tick = () => setLabel(formatNewsAge(iso));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return (
    <time className={className} dateTime={iso} suppressHydrationWarning>
      {label}
    </time>
  );
}
