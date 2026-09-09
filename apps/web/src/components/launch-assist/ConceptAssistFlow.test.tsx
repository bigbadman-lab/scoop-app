import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConceptAssistFlow } from '@/components/launch-assist/ConceptAssistFlow';
import {
  ASSISTED_LAUNCH_HANDOFF_KEY,
  LAUNCH_ASSIST_HANDOFF_KEY,
} from '@/lib/launch-assist/types';

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

vi.mock('@/components/auth/AssistAuthGate', () => ({
  AssistAuthGate: function MockAssistAuthGate({
    onReady,
    visible = true,
  }: {
    onReady: () => void;
    visible?: boolean;
  }) {
    const done = useRef(false);
    if (!done.current) {
      done.current = true;
      queueMicrotask(() => onReady());
    }
    if (!visible) return null;
    return <div data-testid="assist-auth-gate">auth gate</div>;
  },
}));

vi.mock('@/components/auth/AuthInterrupt', () => ({
  AuthInterrupt: ({ onAuthenticated }: { onAuthenticated: () => void }) => (
    <button type="button" onClick={onAuthenticated}>
      mock auth
    </button>
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

  it('shows staged loading messaging', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => {
      expect(screen.getByText(/making a market/i)).toBeTruthy();
      expect(screen.getByText(/reading the story/i)).toBeTruthy();
    });
  });

  it('renders three compact concepts with pair', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => okConcepts(),
    });
    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => {
      expect(screen.getByText('Choose a token idea')).toBeTruthy();
    });
    expect(screen.getByText('Rate Spike')).toBeTruthy();
    expect(screen.getByText('Fed Fade')).toBeTruthy();
    expect(screen.getByText('Desk Heat')).toBeTruthy();
    expect(screen.getAllByText(/Pair · NVDA/).length).toBe(3);
    expect(screen.queryByText(/choose your look/i)).toBeNull();
  });

  it('starts one artwork job and navigates immediately without awaiting images', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    let artworkResolve: ((v: unknown) => void) | null = null;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/concepts')) {
        return { ok: true, status: 200, json: async () => okConcepts() };
      }
      if (String(url).includes('/artwork/start')) {
        return new Promise((resolve) => {
          artworkResolve = resolve;
        });
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => screen.getByText('Rate Spike'));
    fireEvent.click(screen.getAllByRole('button', { name: /use this idea/i })[0]!);

    expect(screen.queryByText(/creating three visual/i)).toBeNull();
    expect(screen.queryByText(/choose your look/i)).toBeNull();
    expect(sessionStorage.getItem(LAUNCH_ASSIST_HANDOFF_KEY)).toBeTruthy();

    artworkResolve?.({
      ok: true,
      status: 200,
      json: async () => ({ draftId: '11111111-1111-1111-1111-111111111111', artworkStatus: 'pending' }),
    });

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/launch?assist=1');
    });

    const handoff = JSON.parse(sessionStorage.getItem(ASSISTED_LAUNCH_HANDOFF_KEY)!);
    expect(handoff.image.source).toBe('pending');
    expect(handoff.draftId).toBe('11111111-1111-1111-1111-111111111111');
    expect(handoff.providerArticleId).toBe('77');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/launch-assist/artwork/start',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(
      fetchMock.mock.calls.filter((c) => String(c[0]).includes('/artwork') && !String(c[0]).includes('/start'))
        .length,
    ).toBe(0);
  });

  it('guards duplicate Use this idea clicks', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    let starts = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/concepts')) {
        return { ok: true, status: 200, json: async () => okConcepts() };
      }
      if (String(url).includes('/artwork/start')) {
        starts += 1;
        await new Promise((r) => setTimeout(r, 50));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            draftId: '11111111-1111-1111-1111-111111111111',
            artworkStatus: 'pending',
          }),
        };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });

    render(<ConceptAssistFlow providerArticleId="77" catalogue={catalogue} />);
    await waitFor(() => screen.getByText('Rate Spike'));
    const buttons = screen.getAllByRole('button', { name: /use this idea/i });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(starts).toBe(1);
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
