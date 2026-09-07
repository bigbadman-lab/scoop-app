'use client';

import { useState } from 'react';
import { ImageFallback } from '@/components/ui/ImageFallback';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  size?: number;
};

/** Token artwork with deliberate SCOOP fallback — never broken-image UI. */
export function TokenImage({ src, alt, className = '', size = 160 }: Props) {
  const [failed, setFailed] = useState(false);
  const usable = Boolean(src && src.trim().length > 0 && !failed);

  if (!usable) {
    return <ImageFallback label={alt} className={className} size={size} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary IPFS/CDN URIs
    <img
      src={src!}
      alt={alt}
      width={size}
      height={size}
      className={`aspect-square object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
