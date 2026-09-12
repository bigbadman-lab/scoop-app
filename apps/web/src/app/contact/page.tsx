import type { Metadata } from 'next';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { XIcon } from '@/components/ui/XIcon';
import { SCOOP_X_URL } from '@/lib/brand';
import { buildPageMetadata } from '@/lib/seo/site';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description:
    'Contact Scoop Tech Ltd trading as SCOOP — email hi@scoop.fun or find us on X @scoopterminal.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <SectionHeading>Contact</SectionHeading>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Contact</h1>

      <article className="mt-8 space-y-10 text-[15px] leading-relaxed text-[var(--muted)]">
        <p>
          Got a question, found something we should know about, or just want to talk SCOOP?
        </p>
        <p>You can reach us by email or find us on X.</p>

        <section id="email" className="scroll-mt-24">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--fg)]">Email</h2>
          <div className="mt-3 space-y-3">
            <p>
              For general enquiries, partnerships, press, support or anything else related to SCOOP:
            </p>
            <p>
              <a
                href="mailto:hi@scoop.fun"
                className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
              >
                hi@scoop.fun
              </a>
            </p>
          </div>
        </section>

        <section id="x" className="scroll-mt-24">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-[var(--fg)]">
            <XIcon className="h-4 w-4" />
            <span className="sr-only">X</span>
          </h2>
          <div className="mt-3 space-y-3">
            <p>Follow SCOOP, keep up with what we&apos;re building or send us a message:</p>
            <p>
              <a
                href={SCOOP_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
              >
                <XIcon className="h-3.5 w-3.5" />
                @scoopterminal
              </a>
            </p>
          </div>
        </section>

        <section id="need-help" className="scroll-mt-24">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--fg)]">Need help?</h2>
          <div className="mt-3 space-y-3">
            <p>
              If you&apos;re contacting us about a wallet, transaction, token launch, trade or
              rewards, include as much relevant information as possible.
            </p>
            <p>
              A <strong className="font-medium text-[var(--fg)]">transaction hash or public wallet address</strong>{' '}
              can help us investigate blockchain-related issues.
            </p>
            <p>
              <strong className="font-medium text-[var(--fg)]">
                Never send us your private key or seed phrase.
              </strong>
            </p>
          </div>
        </section>

        <section id="company" className="scroll-mt-24">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--fg)]">Company</h2>
          <div className="mt-3 space-y-3">
            <p>
              <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
              <br />
              Trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong>
              <br />
              United Kingdom
            </p>
            <p>
              <strong className="font-medium text-[var(--fg)]">scoop.fun</strong>
              <br />
              <a
                href="mailto:hi@scoop.fun"
                className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
              >
                hi@scoop.fun
              </a>
              <br />
              <a
                href={SCOOP_X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
              >
                <XIcon className="h-3.5 w-3.5" />
                @scoopterminal
              </a>
            </p>
          </div>
        </section>

        <aside className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-4 text-[14px] leading-relaxed text-[var(--fg)]">
          <p>
            <strong className="font-medium">Markets move fast. We read our inbox too.</strong>
          </p>
        </aside>
      </article>
    </main>
  );
}
