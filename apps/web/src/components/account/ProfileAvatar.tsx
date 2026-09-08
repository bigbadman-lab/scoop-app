'use client';

import { useState } from 'react';

type Props = {
  src: string | null | undefined;
  label: string;
  size: number;
  className?: string;
  roundedClassName?: string;
};

/**
 * Profile image with initials fallback when src is missing or fails to load.
 */
export function ProfileAvatar({
  src,
  label,
  size,
  className = '',
  roundedClassName = 'rounded-full',
}: Props) {
  const [failed, setFailed] = useState(false);
  const initials = (label.trim() || 'SC')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2) || 'SC';

  if (!src || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center bg-[var(--scoop-orange)] font-mono text-[var(--scoop-orange-contrast)] ${roundedClassName} ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(10, size * 0.32) }}
        aria-hidden
      >
        {initials}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 object-cover ${roundedClassName} ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
