import { ConceptAssistFlow } from '@/components/launch-assist/ConceptAssistFlow';
import { loadEnabledQuoteCatalogue } from '@/lib/quotes/catalogue';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ providerArticleId: string }>;
};

async function loadCatalogueSafe() {
  try {
    return await loadEnabledQuoteCatalogue();
  } catch {
    return [];
  }
}

export default async function NewsLaunchAssistPage({ params }: Props) {
  const { providerArticleId: raw } = await params;
  const providerArticleId = decodeURIComponent(raw ?? '').trim();
  const catalogue = await loadCatalogueSafe();

  if (!providerArticleId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Story not found</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Launch assist needs a valid news article.
        </p>
      </main>
    );
  }

  return (
    <main>
      <ConceptAssistFlow
        providerArticleId={providerArticleId}
        catalogue={catalogue}
      />
    </main>
  );
}
