import Link from 'next/link';
import Image from 'next/image';
import {
  SCOOP_MARK_SRC,
  SCOOP_X_URL,
} from '@/lib/brand';
import { XIcon } from '@/components/ui/XIcon';

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
    <footer
      className="border-t border-[var(--divider)] bg-[var(--bg)]"
      data-testid="site-footer"
    >
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
            <a
              href={SCOOP_X_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="SCOOP on X"
              className="mt-5 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
            >
              <XIcon className="h-4 w-4" />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 md:col-span-8">
            <FooterColumn title="Product" links={PRODUCT} />
            <FooterColumn title="Protocol" links={PROTOCOL} />
            <FooterColumn title="Company" links={COMPANY} />
            <FooterColumn title="Legal" links={LEGAL} />
          </div>
        </div>

        <div className="mt-16 flex items-center justify-between gap-4 border-t border-[var(--divider)] pt-6">
          <p className="font-mono text-[11px] text-[var(--muted-2)]">
            © {new Date().getFullYear()} SCOOP
          </p>
          <a
            href={SCOOP_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="SCOOP on X"
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
          >
            <XIcon className="h-3.5 w-3.5" />
            @scoopterminal
          </a>
        </div>

        <p className="mt-8 max-w-4xl text-[11px] leading-relaxed text-[var(--muted-2)]">
          Scoop.fun does not provide financial, investment, legal, or tax advice.
          Nothing on this website — including news, market data, token listings,
          protocol documentation, or any other content — constitutes a
          recommendation or solicitation to buy, sell, or hold any digital asset
          or financial instrument. Trading and launching tokens involves
          substantial risk of loss, including the possible loss of all capital
          you commit. Past performance is not indicative of future results.
          Digital assets can be highly volatile, illiquid, and subject to
          smart-contract, oracle, custody, and regulatory risk. You are solely
          responsible for your own decisions and should consult independent
          professional advisers before participating. By using Scoop.fun, you
          acknowledge that you understand these risks and that Scoop.fun and its
          affiliates accept no liability for any losses incurred.
        </p>
      </div>
    </footer>
  );
}
