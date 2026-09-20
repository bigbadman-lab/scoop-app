import { PlatformBadge } from '@/components/home/PlatformBadge';

type Props = {
  className?: string;
};

function BrandIcon({
  src,
  testId,
  contain = false,
}: {
  src: string;
  testId: string;
  contain?: boolean;
}) {
  return (
    <span
      data-testid={testId}
      className={[
        'relative block h-5 w-5 overflow-hidden rounded-[6px] sm:h-7 sm:w-7 sm:rounded-[8px]',
        contain ? 'flex items-center justify-center bg-[var(--bg)]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={32}
        height={32}
        className={
          contain
            ? 'h-4 w-4 object-contain sm:h-5 sm:w-5'
            : 'h-full w-full object-cover'
        }
      />
    </span>
  );
}

function PonsMonogram() {
  return (
    <span
      data-testid="platform-badge-pons-icon"
      className="flex h-5 w-5 items-center justify-center rounded-[6px] border border-[var(--divider)] bg-[var(--bg)] text-[10px] font-semibold tracking-tight text-[var(--fg)] sm:h-7 sm:w-7 sm:rounded-[8px] sm:text-[12px]"
      aria-hidden
    >
      P
    </span>
  );
}

/**
 * Homepage hero infrastructure badges: Solana, Pump.fun, Robinhood Chain, Pons.
 * Always one horizontal row — badges share width and truncate on narrow viewports.
 */
export function HomepageInfrastructureBadges({ className = '' }: Props) {
  return (
    <div
      data-testid="homepage-infrastructure-badges"
      className={[
        'flex w-full min-w-0 flex-nowrap items-center gap-1 sm:w-auto sm:gap-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Launch rails"
    >
      <PlatformBadge
        icon={<BrandIcon src="/brand/solana.svg" testId="platform-badge-solana-icon" />}
        eyebrow="Built on"
        value="Solana"
      />
      <PlatformBadge
        icon={
          <BrandIcon
            src="/brand/pump.svg"
            testId="platform-badge-pump-icon"
            contain
          />
        }
        eyebrow="Launch via"
        value="Pump.fun"
      />
      <PlatformBadge
        icon={<BrandIcon src="/brand/rh.svg" testId="platform-badge-rh-icon" />}
        eyebrow="Built on"
        value="Robinhood Chain"
      />
      <PlatformBadge icon={<PonsMonogram />} eyebrow="Launch via" value="Pons" />
    </div>
  );
}
