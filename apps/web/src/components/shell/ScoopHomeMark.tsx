'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { SCOOP_MARK_SRC } from '@/lib/brand';

type ScoopHomeMarkProps = {
  size: 'sidebar' | 'mobile';
  className?: string;
};

const SIZE = {
  sidebar: {
    px: 72,
    className: 'h-[4.25rem] w-[4.25rem]',
    linkClassName: 'mb-8 inline-flex focus-visible:outline-offset-4',
  },
  mobile: {
    px: 52,
    className: 'h-[3.25rem] w-[3.25rem]',
    linkClassName: 'inline-flex',
  },
} as const;

/**
 * Top-left SCOOP mark — subtle hover tilt + click spin for presence.
 */
export function ScoopHomeMark({ size, className }: ScoopHomeMarkProps) {
  const [spinning, setSpinning] = useState(false);
  const spec = SIZE[size];

  return (
    <Link
      href="/"
      aria-label="SCOOP home"
      className={['scoop-home-mark', spec.linkClassName, className]
        .filter(Boolean)
        .join(' ')}
      onClick={() => {
        setSpinning(true);
      }}
    >
      <Image
        src={SCOOP_MARK_SRC}
        alt=""
        width={spec.px}
        height={spec.px}
        priority
        onAnimationEnd={() => setSpinning(false)}
        className={[
          'scoop-home-mark__img object-contain',
          spec.className,
          spinning ? 'is-spinning' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </Link>
  );
}
