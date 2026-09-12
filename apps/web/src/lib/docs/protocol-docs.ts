import { accessSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Canonical protocol documentation Markdown lives at the monorepo root.
 * Next/vitest usually run with cwd = apps/web.
 */
export function resolveProtocolDocsPath(): string {
  const candidates = [
    path.join(process.cwd(), 'scoop-protocol-docs.md'),
    path.join(process.cwd(), '..', 'scoop-protocol-docs.md'),
    path.join(process.cwd(), '..', '..', 'scoop-protocol-docs.md'),
  ];
  for (const candidate of candidates) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    `scoop-protocol-docs.md not found (cwd=${process.cwd()}). Expected monorepo root.`,
  );
}

export function loadProtocolDocsMarkdown(): string {
  return readFileSync(resolveProtocolDocsPath(), 'utf8');
}

export type ProtocolDocsSection = {
  number: number;
  title: string;
  /** Full heading text without leading "# " */
  heading: string;
  id: string;
};

/** Stable slug for a numbered H1 section title. */
export function protocolDocsSectionId(number: number, title: string): string {
  const base = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${number}-${base}`;
}

/**
 * Extract major `# N. Title` sections for sticky/mobile navigation.
 */
export function extractProtocolDocsSections(markdown: string): ProtocolDocsSection[] {
  const sections: ProtocolDocsSection[] = [];
  const re = /^# (\d+)\.\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const number = Number.parseInt(match[1]!, 10);
    const title = match[2]!.trim();
    sections.push({
      number,
      title,
      heading: `${number}. ${title}`,
      id: protocolDocsSectionId(number, title),
    });
  }
  return sections;
}

/** Known developer resource destinations surfaced as links in docs UI. */
export const PROTOCOL_DOCS_EXTERNAL_LINKS = {
  protocolRepo: 'https://github.com/bigbadman-lab/scoop-protocol',
  appRepo: 'https://github.com/bigbadman-lab/scoop-app',
  explorer: 'https://explorer.mainnet.chain.robinhood.com',
  apiBase: 'https://scoop.fun/api/',
} as const;

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isEthereumAddress(value: string): boolean {
  return ADDRESS_RE.test(value.trim());
}

/**
 * Map a plain developer-resource string (with or without scheme) to an https URL.
 * Returns null when the string is not one of the confirmed resources.
 */
export function resolveDocsResourceHref(raw: string): string | null {
  const value = raw.trim().replace(/^https?:\/\//, '');
  if (value === 'github.com/bigbadman-lab/scoop-protocol') {
    return PROTOCOL_DOCS_EXTERNAL_LINKS.protocolRepo;
  }
  if (value === 'github.com/bigbadman-lab/scoop-app') {
    return PROTOCOL_DOCS_EXTERNAL_LINKS.appRepo;
  }
  if (value === 'explorer.mainnet.chain.robinhood.com') {
    return PROTOCOL_DOCS_EXTERNAL_LINKS.explorer;
  }
  if (value === 'scoop.fun/api/...' || value === 'scoop.fun/api/') {
    return PROTOCOL_DOCS_EXTERNAL_LINKS.apiBase;
  }
  if (raw.trim() === 'https://scoop.fun/api/...') {
    return PROTOCOL_DOCS_EXTERNAL_LINKS.apiBase;
  }
  return null;
}
