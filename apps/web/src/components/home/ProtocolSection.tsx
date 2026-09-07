import { CtaLink } from '@/components/ui/CtaLink';

/**
 * Full orange editorial section — protocol activity feeds $SCOOP
 * via buybacks and operations. No invented metrics.
 */
export function ProtocolSection() {
  return (
    <section
      aria-labelledby="protocol-heading"
      className="bg-[var(--scoop-orange)] text-[var(--scoop-orange-contrast)]"
    >
      <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8 md:py-24 lg:px-10">
        <p className="font-mono text-[12px] uppercase tracking-[0.2em]">$Scoop</p>
        <h2
          id="protocol-heading"
          className="mt-6 max-w-3xl font-serif text-4xl leading-[1.05] tracking-tight md:text-6xl lg:text-7xl"
        >
          The market
          <br />
          feeds the
          <br />
          market.
        </h2>
        <p className="mt-8 max-w-md text-base md:text-lg">
          Trading and launch activity fund protocol fees — directed to buybacks and
          operations for $SCOOP.
        </p>

        <ol className="mt-12 max-w-sm space-y-3 font-mono text-[12px] uppercase tracking-[0.14em]">
          <li>Trading + launch activity</li>
          <li aria-hidden className="pl-1 text-[var(--scoop-orange-contrast)]/70">
            ↓
          </li>
          <li>Protocol fees</li>
          <li aria-hidden className="pl-1 text-[var(--scoop-orange-contrast)]/70">
            ↓
          </li>
          <li>Buybacks + operations</li>
        </ol>

        {/* EXPLORE $SCOOP deferred — no dedicated destination yet */}
        <div className="mt-12">
          <CtaLink href="/docs" variant="on-orange">
            Protocol notes →
          </CtaLink>
        </div>
      </div>
    </section>
  );
}
