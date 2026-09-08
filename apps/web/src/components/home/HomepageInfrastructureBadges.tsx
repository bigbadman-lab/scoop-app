import { PlatformBadge } from '@/components/home/PlatformBadge';
import { MarketsPairIcon } from '@/components/ui/MarketsPairIcon';

type Props = {
  className?: string;
};

function RhIcon() {
  return (
    <span
      data-testid="platform-badge-rh-icon"
      className="relative block h-6 w-6 overflow-hidden rounded-[7px] sm:h-8 sm:w-8 sm:rounded-[9px]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/rh.svg"
        alt=""
        width={32}
        height={32}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

function UniIcon() {
  return (
    <span
      data-testid="platform-badge-uni-icon"
      className="relative flex h-6 w-6 items-center justify-center sm:h-8 sm:w-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/uni.svg"
        alt=""
        width={28}
        height={28}
        className="h-5 w-5 object-contain sm:h-7 sm:w-7"
      />
    </span>
  );
}

/**
 * Homepage hero infrastructure badges: Robinhood Chain, Uniswap, Stocks + ETH.
 * Always one horizontal row — badges share width and truncate on narrow viewports.
 */
export function HomepageInfrastructureBadges({ className = '' }: Props) {
  return (
    <div
      data-testid="homepage-infrastructure-badges"
      className={[
        'flex w-full min-w-0 flex-nowrap items-center gap-1.5 sm:w-auto sm:gap-2.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Platform infrastructure"
    >
      <PlatformBadge icon={<RhIcon />} eyebrow="Built on" value="Robinhood Chain" />
      <PlatformBadge icon={<UniIcon />} eyebrow="Powered by" value="Uniswap" />
      <PlatformBadge
        icon={
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-[var(--divider)] bg-[var(--bg)] text-[var(--fg)] sm:h-8 sm:w-8 sm:rounded-[9px]">
            <MarketsPairIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        }
        eyebrow="Markets paired with"
        value="Stocks + ETH"
      />
    </div>
  );
}
