import { PlatformBadge } from '@/components/home/PlatformBadge';
import { MarketsPairIcon } from '@/components/ui/MarketsPairIcon';

type Props = {
  className?: string;
};

function RhIcon() {
  return (
    <span
      data-testid="platform-badge-rh-icon"
      className="relative block h-5 w-5 overflow-hidden rounded-[6px] sm:h-7 sm:w-7 sm:rounded-[8px]"
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
      className="relative flex h-5 w-5 items-center justify-center sm:h-7 sm:w-7"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/uni.svg"
        alt=""
        width={28}
        height={28}
        className="h-4 w-4 object-contain sm:h-6 sm:w-6"
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
        'flex w-full min-w-0 flex-nowrap items-center gap-1 sm:w-auto sm:gap-2',
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
          <span className="flex h-5 w-5 items-center justify-center rounded-[6px] border border-[var(--divider)] bg-[var(--bg)] text-[var(--fg)] sm:h-7 sm:w-7 sm:rounded-[8px]">
            <MarketsPairIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </span>
        }
        eyebrow="Markets paired with"
        value="Stocks + ETH"
      />
    </div>
  );
}
