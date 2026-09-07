import Link from 'next/link';
import Image from 'next/image';
import { ROBINHOOD_CHAIN_ID, ROBINHOOD_CHAIN_LABEL, SCOOP_MARK_SRC } from '@/lib/brand';

type FooterLink = { label: string; href: string; available: boolean };

const PRODUCT: FooterLink[] = [
  { label: 'Home', href: '/', available: true },
  { label: 'News', href: '/news', available: true },
  { label: 'Launch', href: '/launch', available: true },
  { label: 'Account', href: '/account', available: true },
];

const PROTOCOL: FooterLink[] = [
  { label: '$SCOOP', href: '/docs', available: true },
  { label: 'Docs', href: '/docs', available: true },
];

const COMPANY: FooterLink[] = [
  { label: 'About', href: '/about', available: true },
  { label: 'Contact', href: '/contact', available: true },
  { label: 'Support', href: '/support', available: true },
];

const LEGAL: FooterLink[] = [
  { label: 'Terms', href: '/legal/terms', available: true },
  { label: 'Privacy', href: '/legal/privacy', available: true },
  { label: 'Risk disclosure', href: '/legal/risk', available: true },
  { label: 'Disclaimer', href: '/legal/disclaimer', available: true },
];

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
        {title}
      </p>
      <ul className="mt-4 space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            {link.available ? (
              <Link
                href={link.href}
                className="text-sm text-[var(--fg)] hover:opacity-70"
              >
                {link.label}
              </Link>
            ) : (
              <span className="text-sm text-[var(--muted-2)]">{link.label}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--divider)] bg-[var(--bg)]">
      <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8 md:py-20 lg:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <Image
              src={SCOOP_MARK_SRC}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 object-contain"
            />
            <p className="mt-6 max-w-xs font-serif text-2xl leading-snug tracking-tight">
              Live markets from the news cycle.
            </p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
              {ROBINHOOD_CHAIN_LABEL} · Chain ID {ROBINHOOD_CHAIN_ID}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 md:col-span-8">
            <FooterColumn title="Product" links={PRODUCT} />
            <FooterColumn title="Protocol" links={PROTOCOL} />
            <FooterColumn title="Company" links={COMPANY} />
            <FooterColumn title="Legal" links={LEGAL} />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-[var(--divider)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] text-[var(--muted-2)]">
            © {new Date().getFullYear()} SCOOP
          </p>
          <p className="font-mono text-[11px] text-[var(--muted-2)]">
            Editorial × Markets × Live
          </p>
        </div>
      </div>
    </footer>
  );
}
