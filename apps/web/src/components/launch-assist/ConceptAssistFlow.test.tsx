import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConceptAssistFlow } from '@/components/launch-assist/ConceptAssistFlow';
import { LAUNCH_ASSIST_HANDOFF_KEY } from '@/lib/launch-assist/types';

const push = vi.fn();
const back = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const quoteAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const catalogue = [
  {
    chainId: 4663,
    quoteAsset: quoteAddress,
    quoteType: 'stock',
    symbol: 'NVDA',
    displaySymbol: 'NVDA',
    name: 'NVIDIA Corporation',
    decimals: 18,
    category: 'stock' as const,
    imageUrl: '/quotes/nvda.png',
    sourceName: null,
    sortOrder: 1,
    isRegistered: true,
    isEnabled: true,
  },
];

function okConcepts() {
  return {
    article: {
      providerArticleId: '77',
      headline: 'Markets react to rate decision',
      sourceDomain: 'reuters.com',
      publishedAt: '2026-09-07T12:00:00.000Z',
      url: 'https://reuters.com/markets/rate-decision',
    },
    concepts: [
      {
        id: 'concept_1',
        name: 'Rate Spike',
        ticker: 'RATE',
        description: 'First angle',
        recommendedPairAddress: quoteAddress,
        recommendedPairSymbol: 'NVDA',
        pairRationale: 'Chip story',
        imageDirection: 'desk photo',
        pairEnabled: true,
      },
      {
        id: 'concept_2',
        name: 'Fed Fade',
        ticker: 'FADE',
        description: 'Second angle',
        recommendedPairAddress: quoteAddress,
        recommendedPairSymbol: 'NVDA',
        pairRationale: 'Policy angle',
        imageDirection: 'chart',
        pairEnabled: true,
      },
      {
        id: 'concept_3',
        name: 'Desk Heat',
        ticker: 'HEAT',
        description: 'Third angle',
        recommendedPairAddress: quoteAddress,
        recommendedPairSymbol: 'NVDA',
        pairRationale: 'Trading desk',
        imageDirection: 'crowd',
        pairEnabled: true,
      },
    ],
  };
}

describe('ConceptAssistFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    global.fetch = vi.fn();
  });

  it('shows making-a-market loading state', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    expect(screen.getByText(/making a market/i)).toBeTruthy();
  });

  it('renders three concepts with story provenance', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => okConcepts(),
    });
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => {
      expect(screen.getByText('Choose your angle')).toBeTruthy();
    });
    expect(screen.getByText('Rate Spike')).toBeTruthy();
    expect(screen.getByText('Fed Fade')).toBeTruthy();
    expect(screen.getByText('Desk Heat')).toBeTruthy();
  });

  it('starts image generation after Use this idea', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/concepts')) {
        return { ok: true, status: 200, json: async () => okConcepts() };
      }
      return new Promise(() => {});
    });
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => screen.getByText('Rate Spike'));
    fireEvent.click(screen.getAllByRole('button', { name: /use this idea/i })[0]!);
    await waitFor(() => screen.getByText(/creating your token/i));
    expect(sessionStorage.getItem(LAUNCH_ASSIST_HANDOFF_KEY)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/launch-assist/artwork',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows image chooser after successful artwork generation', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/concepts')) {
        return { ok: true, status: 200, json: async () => okConcepts() };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          draftId: 'draft-1',
          images: [
            {
              assetId: 'a1',
              index: 1,
              previewUrl: 'https://signed.example/1.png',
              mimeType: 'image/png',
              width: 1024,
              height: 1024,
            },
            {
              assetId: 'a2',
              index: 2,
              previewUrl: 'https://signed.example/2.png',
              mimeType: 'image/png',
              width: 1024,
              height: 1024,
            },
            {
              assetId: 'a3',
              index: 3,
              previewUrl: 'https://signed.example/3.png',
              mimeType: 'image/png',
              width: 1024,
              height: 1024,
            },
          ],
        }),
      };
    });
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => screen.getByText('Rate Spike'));
    fireEvent.click(screen.getAllByRole('button', { name: /use this idea/i })[0]!);
    await waitFor(() => screen.getByText(/choose your look/i));
    expect(screen.getByLabelText(/select artwork 01/i)).toBeTruthy();
  });

  it('shows rate-limit state without try-again for concepts', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        error: "You've reached the current generation limit. Try again shortly.",
        code: 'RATE_LIMITED',
      }),
    });
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => screen.getByText(/limit reached/i));
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('shows retry on retriable concept error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Could not generate launch concepts for this story.' }),
    });
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => screen.getByRole('button', { name: /try again/i }));
  });
});
