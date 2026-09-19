import Link from 'next/link';
import { XIcon } from '@/components/ui/XIcon';
import { SCOOP_X_URL } from '@/lib/brand';
import {
  SUPPORT_TOPICS,
  type SupportAnswerBlock,
  type SupportFaq,
} from '@/lib/support/topics';

function AnswerBlocks({ blocks }: { blocks: SupportAnswerBlock[] }) {
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-[var(--muted)] sm:text-[15px]">
      {blocks.map((block, index) => {
        if (block.type === 'ul') {
          return (
            <ul key={index} className="list-disc space-y-1.5 pl-5">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'ol') {
          return (
            <ol key={index} className="list-decimal space-y-1.5 pl-5">
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          );
        }
        if ('emphasis' in block && block.emphasis === 'strong') {
          return (
            <p key={index}>
              <strong className="font-medium text-[var(--fg)]">{block.text}</strong>
            </p>
          );
        }
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}

function FaqItem({ faq }: { faq: SupportFaq }) {
  return (
    <details
      id={faq.id}
      className="group border-b border-[var(--divider)] last:border-b-0"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-left marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1 break-words text-[15px] font-medium leading-snug text-[var(--fg)] sm:text-base">
          {faq.question}
        </span>
        <span
          aria-hidden
          className="mt-0.5 shrink-0 font-mono text-[12px] text-[var(--muted-2)] transition-transform duration-200 group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="pb-5 pr-8">
        <AnswerBlocks blocks={faq.answer} />
      </div>
    </details>
  );
}

/**
 * Support center layout: intro + security callout, sticky topic nav,
 * accordion FAQs, and contact CTA. Not a legal-style wall of prose.
 */
export function SupportPageView() {
  return (
    <div className="mt-8 min-w-0">
      <div className="max-w-2xl space-y-4 text-[15px] leading-relaxed text-[var(--muted)]">
        <p>Need help with SCOOP?</p>
        <p>
          Start here for answers about accounts, wallets, launching tokens, trading, stock pairs,
          fees, rewards and blockchain transactions.
        </p>
        <p>
          If you can&apos;t find what you need, contact us at{' '}
          <a
            href="mailto:hi@scoop.fun"
            className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
          >
            hi@scoop.fun
          </a>{' '}
          or message{' '}
          <a
            href={SCOOP_X_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
          >
            <XIcon className="h-3.5 w-3.5" />
            @scoopterminal
          </a>{' '}
          on X.
        </p>
      </div>

      <aside className="mt-6 rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--scoop-green)_35%,var(--divider))] bg-[color-mix(in_srgb,var(--scoop-green)_6%,var(--bg))] px-4 py-3.5 text-[14px] leading-relaxed text-[var(--fg)]">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--scoop-green)]">
          Security
        </p>
        <p className="mt-1.5">
          <strong className="font-medium">
            Never send anyone your private key or seed phrase. SCOOP will never ask for them.
          </strong>
        </p>
      </aside>

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href="mailto:hi@scoop.fun"
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
        >
          Email support
        </a>
        <a
          href={SCOOP_X_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 text-sm font-medium text-[var(--fg)] transition-colors hover:border-[var(--fg)]"
        >
          <XIcon className="h-3.5 w-3.5" />
          Message on X
        </a>
      </div>

      <div className="mt-12 grid min-w-0 gap-10 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-12">
        <nav
          aria-label="Support topics"
          className="min-w-0 lg:sticky lg:top-24 lg:self-start"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted)]">
            Browse topics
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 lg:flex-col lg:gap-0">
            {SUPPORT_TOPICS.map((topic) => (
              <li key={topic.id} className="min-w-0 max-w-full">
                <a
                  href={`#${topic.id}`}
                  className="inline-block max-w-full rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm leading-snug text-[var(--muted)] transition-colors hover:border-[color-mix(in_srgb,var(--fg)_28%,var(--divider))] hover:text-[var(--fg)] lg:border-0 lg:bg-transparent lg:px-0 lg:py-1.5 lg:hover:border-0"
                >
                  {topic.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-10">
          {SUPPORT_TOPICS.map((topic) => (
            <section
              key={topic.id}
              id={topic.id}
              className="scroll-mt-24"
              aria-labelledby={`${topic.id}-heading`}
            >
              <div className="border-b border-[var(--divider)] pb-3">
                <h2
                  id={`${topic.id}-heading`}
                  className="text-xl font-semibold tracking-tight text-[var(--fg)]"
                >
                  {topic.label}
                </h2>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted-2)]">
                  {topic.faqs.length} {topic.faqs.length === 1 ? 'answer' : 'answers'}
                </p>
              </div>
              <div>
                {topic.faqs.map((faq) => (
                  <FaqItem key={faq.id} faq={faq} />
                ))}
              </div>
            </section>
          ))}

          <section
            id="contact-support"
            className="scroll-mt-24 rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-5 py-6 sm:px-6"
          >
            <h2 className="text-xl font-semibold tracking-tight text-[var(--fg)]">
              Contact Support
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">
              Still need help?
            </p>
            <dl className="mt-5 space-y-3 text-[15px]">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  Email
                </dt>
                <dd>
                  <a
                    href="mailto:hi@scoop.fun"
                    className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
                  >
                    hi@scoop.fun
                  </a>
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
                  X
                </dt>
                <dd>
                  <a
                    href={SCOOP_X_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    @scoopterminal
                  </a>
                </dd>
              </div>
            </dl>
            <div className="mt-5 space-y-2 text-[14px] leading-relaxed text-[var(--muted)]">
              <p>
                For transaction-related problems, including a transaction hash usually helps us
                investigate faster.
              </p>
              <p>
                For security issues, email{' '}
                <a
                  href="mailto:hi@scoop.fun?subject=Security"
                  className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
                >
                  hi@scoop.fun
                </a>{' '}
                with <strong className="font-medium text-[var(--fg)]">Security</strong> in the
                subject line.
              </p>
              <p className="font-medium text-[var(--fg)]">
                SCOOP support will never ask for your seed phrase or private key.
              </p>
            </div>
          </section>

          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            Before trading or launching through SCOOP, we also recommend reading our{' '}
            <Link
              href="/legal/terms"
              className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
            >
              Terms of Use
            </Link>
            ,{' '}
            <Link
              href="/legal/risk"
              className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
            >
              Risk Disclosure
            </Link>
            ,{' '}
            <Link
              href="/legal/privacy"
              className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
            >
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link
              href="/legal/disclaimer"
              className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
            >
              Disclaimer
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
