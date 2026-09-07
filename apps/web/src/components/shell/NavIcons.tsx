import type { NavItem } from '@/components/shell/nav';

type IconProps = {
  className?: string;
};

function IconFrame({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function DiscoverIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M4.75 10.75 12 4.75l7.25 6" />
      <path d="M7.25 9.75v8.5h9.5v-8.5" />
    </IconFrame>
  );
}

export function NewsIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M5 4.75h11.5A2.75 2.75 0 0 1 19.25 7.5v11.75H7.5A2.75 2.75 0 0 1 4.75 16.5V5.5" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4.5" />
    </IconFrame>
  );
}

export function CreateIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <path d="M12 5.5v13M5.5 12h13" />
    </IconFrame>
  );
}

export function AccountIcon({ className }: IconProps) {
  return (
    <IconFrame className={className}>
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M5.75 19.25a6.25 6.25 0 0 1 12.5 0" />
    </IconFrame>
  );
}

const ICONS: Record<NavItem['id'], (props: IconProps) => React.ReactNode> = {
  discover: DiscoverIcon,
  news: NewsIcon,
  create: CreateIcon,
  account: AccountIcon,
  docs: DiscoverIcon,
  support: AccountIcon,
};

export function NavIcon({ id, className = 'h-5 w-5' }: { id: NavItem['id']; className?: string }) {
  const Icon = ICONS[id];
  return <Icon className={className} />;
}
