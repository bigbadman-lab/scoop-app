'use client';

import { useState } from 'react';
import { ImageFallback } from '@/components/ui/ImageFallback';
import { resolveTokenImageSrc } from '@/lib/media/resolve-token-image';

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  size?: number;
};

/** Token artwork with IPFS→HTTPS resolution and SCOOP fallback — never broken-image UI. */
export function TokenImage({ src, alt, className = '', size = 160 }: Props) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveTokenImageSrc(src);
  const usable = Boolean(resolved && !failed);

  if (!usable) {
    return <ImageFallback label={alt} className={className} size={size} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- resolved IPFS/CDN URIs; not next/image remotePatterns
    <img
      src={resolved!}
      alt={alt}
      width={size}
      height={size}
      className={`aspect-square object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
