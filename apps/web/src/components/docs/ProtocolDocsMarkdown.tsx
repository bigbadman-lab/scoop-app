import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  isEthereumAddress,
  protocolDocsSectionId,
  resolveDocsResourceHref,
} from '@/lib/docs/protocol-docs';

function ExternalAnchor({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const external = /^https?:\/\//i.test(href) || href.startsWith('mailto:');
  if (!external) {
    return (
      <a
        href={href}
        className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
      >
        {children}
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[var(--fg)] underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:opacity-90"
    >
      {children}
    </a>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  const text = String(children);
  return (
    <code className="rounded-[4px] bg-[color-mix(in_srgb,var(--fg)_6%,var(--bg))] px-1.5 py-0.5 font-mono text-[0.86em] text-[var(--fg)] break-all">
      {text}
    </code>
  );
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const text = String(children).replace(/\n$/, '');
  const resourceHref = resolveDocsResourceHref(text);
  if (resourceHref && !text.includes('\n')) {
    return (
      <pre className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--fg)]">
        <ExternalAnchor href={resourceHref}>{text}</ExternalAnchor>
      </pre>
    );
  }
  if (isEthereumAddress(text) && !text.includes('\n')) {
    return (
      <pre className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[13px] leading-relaxed text-[var(--fg)]">
        <code className="break-all">{text}</code>
      </pre>
    );
  }
  return (
    <pre className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 font-mono text-[12.5px] leading-relaxed text-[var(--fg)] sm:text-[13px]">
      <code className={className}>{text}</code>
    </pre>
  );
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function flattenText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as { props?: { children?: React.ReactNode } }).props;
    return flattenText(props?.children);
  }
  return '';
}

function headingText(children: React.ReactNode): string {
  return flattenText(children);
}

const components: Components = {
  h1: ({ children }) => {
    const text = headingText(children);
    const numbered = text.match(/^(\d+)\.\s+(.+)$/);
    const id = numbered
      ? protocolDocsSectionId(Number.parseInt(numbered[1]!, 10), numbered[2]!)
      : slugifyHeading(text);
    // Standalone MD uses `#` for title and numbered sections. On the page:
    // document title stays h1; numbered sections demote to h2 for hierarchy.
    if (!numbered) {
      return (
        <h1
          id={id}
          className="scroll-mt-28 font-serif text-3xl leading-tight tracking-tight text-[var(--fg)] md:text-4xl"
        >
          {children}
        </h1>
      );
    }
    return (
      <h2
        id={id}
        className="scroll-mt-28 mt-14 border-t border-[var(--divider)] pt-10 text-2xl font-semibold tracking-tight text-[var(--fg)] first:mt-0 first:border-t-0 first:pt-0 md:text-[1.65rem]"
      >
        {children}
      </h2>
    );
  },
  h2: ({ children }) => {
    const text = headingText(children);
    return (
      <h3
        id={slugifyHeading(text)}
        className="scroll-mt-28 mt-10 text-lg font-semibold tracking-tight text-[var(--fg)]"
      >
        {children}
      </h3>
    );
  },
  h3: ({ children }) => {
    const text = headingText(children);
    return (
      <h4
        id={slugifyHeading(text)}
        className="scroll-mt-28 mt-8 text-base font-semibold tracking-tight text-[var(--fg)]"
      >
        {children}
      </h4>
    );
  },
  p: ({ children }) => (
    <p className="mt-4 text-[15px] leading-relaxed text-[var(--muted)] first:mt-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--fg)]">{children}</strong>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-[var(--muted)]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-[var(--muted)]">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  hr: () => <hr className="my-10 border-[var(--divider)]" />,
  a: ({ href, children }) =>
    href ? <ExternalAnchor href={href}>{children}</ExternalAnchor> : <>{children}</>,
  code: ({ className, children }) => {
    const isBlock = Boolean(className);
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    const text = String(children);
    const resourceHref = resolveDocsResourceHref(text);
    if (resourceHref) {
      return (
        <ExternalAnchor href={resourceHref}>
          <InlineCode>{text}</InlineCode>
        </ExternalAnchor>
      );
    }
    return <InlineCode>{children}</InlineCode>;
  },
  pre: ({ children }) => {
    // react-markdown nests <code> inside <pre>; unwrap for our CodeBlock.
    if (
      children &&
      typeof children === 'object' &&
      'props' in (children as { props?: { className?: string; children?: React.ReactNode } })
    ) {
      const child = children as {
        props: { className?: string; children?: React.ReactNode };
      };
      return (
        <CodeBlock className={child.props.className}>{child.props.children}</CodeBlock>
      );
    }
    return <CodeBlock>{children}</CodeBlock>;
  },
  table: ({ children }) => (
    <div className="my-5 max-w-full overflow-x-auto rounded-[var(--radius-md)] border border-[var(--divider)]">
      <table className="min-w-full border-collapse text-left text-[13px] sm:text-[14px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[color-mix(in_srgb,var(--fg)_4%,var(--bg))]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-t border-[var(--divider)] first:border-t-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2.5 align-top text-[var(--fg)] [&_code]:break-all">{children}</td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-[var(--scoop-orange)] pl-4 text-[15px] leading-relaxed text-[var(--muted)]">
      {children}
    </blockquote>
  ),
};

type Props = {
  markdown: string;
};

/**
 * Renders canonical scoop-protocol-docs.md with SCOOP long-form docs styling.
 * Does not alter protocol meaning — presentation only.
 */
export function ProtocolDocsMarkdown({ markdown }: Props) {
  return (
    <div
      className="protocol-docs min-w-0 [&>h1:first-child+p]:mt-5 [&>h1:first-child+p]:text-[17px] [&>h1:first-child+p]:leading-snug [&>h1:first-child+p]:text-[var(--fg)] md:[&>h1:first-child+p]:text-lg"
      data-testid="protocol-docs-content"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
