import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LaunchFlowLive } from '@/components/launch/LaunchFlowLive';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  ASSISTED_LAUNCH_HANDOFF_KEY,
  ASSISTED_LAUNCH_MARKER,
} from '@/lib/launch-assist/types';

const searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const mockConnectedAddress = vi.fn(
  (): `0x${string}` | undefined =>
    '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C',
);

const mockSolanaAddress = vi.fn((): string | undefined => undefined);

const mockWalletSession = vi.fn(() => ({
  connected: true,
  authenticated: false,
  namespace: null as 'eip155' | 'solana' | null,
  address: null as string | null,
  providerReady: false,
  authMethod: null as 'siwe' | 'siws' | null,
  userId: null as string | null,
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: mockConnectedAddress(),
    chainId: 4663,
    isConnected: Boolean(mockConnectedAddress()),
    status: mockConnectedAddress() ? 'connected' : 'disconnected',
  }),
  usePublicClient: () => ({}),
  useWalletClient: () => ({ data: {} }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
}));

vi.mock('@reown/appkit/react', () => ({
  useAppKit: () => ({ open: vi.fn() }),
  useAppKitAccount: () => ({
    address: mockSolanaAddress(),
    isConnected: Boolean(mockSolanaAddress()),
  }),
  useAppKitProvider: () => ({
    walletProvider: mockSolanaAddress() ? {} : undefined,
  }),
}));

vi.mock('@reown/appkit-adapter-solana/react', () => ({
  useAppKitConnection: () => ({ connection: null }),
}));

vi.mock('@/lib/auth/use-scoop-wallet-session', () => ({
  useScoopWalletSession: () => mockWalletSession(),
}));

vi.mock('@/lib/auth/open-scoop-auth', () => ({
  requestScoopConnect: vi.fn(),
}));

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (blob: Blob) => {
      const { readRasterImageDimensions } = await import(
        '@/lib/launch/image-dimensions'
      );
      const buf = new Uint8Array(await blob.arrayBuffer());
      const dims = readRasterImageDimensions(buf);
      return { width: dims.width, height: dims.height, close: vi.fn() };
    }),
  );
});

const SQUARE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4oaGBFTEMLQkAgl1GAXRgBQ4AAAAASUVORK5CYII=',
  'base64',
);

const eth: PublicQuoteCatalogueItem = {
  chainId: 4663,
  quoteAsset: '0x0000000000000000000000000000000000000000',
  quoteType: 'native',
  symbol: 'ETH',
  displaySymbol: 'ETH',
  name: 'Ether',
  decimals: 18,
  category: 'native',
  imageUrl: null,
  sourceName: null,
  sortOrder: 1,
  isRegistered: true,
  isEnabled: true,
};

const nvda: PublicQuoteCatalogueItem = {
  chainId: 4663,
  quoteAsset: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  quoteType: 'stock',
  symbol: 'NVDA',
  displaySymbol: 'NVDA',
  name: 'NVIDIA Corporation',
  decimals: 18,
  category: 'stock',
  imageUrl: '/quotes/nvda.png',
  sourceName: null,
  sortOrder: 2,
  isRegistered: true,
  isEnabled: true,
};

function seedAssistHandoff(
  quoteAsset = nvda.quoteAsset,
  articleUrl = 'https://reuters.com/a',
) {
  sessionStorage.setItem(
    ASSISTED_LAUNCH_HANDOFF_KEY,
    JSON.stringify({
      marker: ASSISTED_LAUNCH_MARKER,
      providerArticleId: '77',
      article: {
        providerArticleId: '77',
        headline: 'Markets react to rate decision',
        sourceDomain: 'reuters.com',
        publishedAt: '2026-09-07T12:00:00.000Z',
        url: articleUrl,
      },
      concept: {
        id: 'concept_1',
        name: 'Rate Spike',
        ticker: 'RATE',
        description: 'A market on rate moves',
        recommendedPairAddress: quoteAsset,
        recommendedPairSymbol: 'NVDA',
        pairRationale: 'why',
        imageDirection: 'desk',
        pairEnabled: true,
      },
      draftId: 'draft-1',
      quoteAsset,
      quoteSymbol: 'NVDA',
      image: {
        source: 'generated',
        previewUrl: 'https://signed.example/1.png',
        fileName: 'token-1.png',
        mimeType: 'image/png',
        byteSize: null,
        artworkAssetId: 'a1',
        draftId: 'draft-1',
      },
      createdAt: new Date().toISOString(),
    }),
  );
}

describe('LaunchFlowLive', () => {
  beforeEach(() => {
    sessionStorage.clear();
    searchParams.delete('assist');
    mockConnectedAddress.mockReturnValue(
      '0x35AFfbCcC92ADd3FaB6b515326Da1433DcA7Cf9C',
    );
    mockSolanaAddress.mockReturnValue(undefined);
    mockWalletSession.mockReturnValue({
      connected: true,
      authenticated: false,
      namespace: null,
      address: null,
      providerReady: false,
      authMethod: null,
      userId: null,
    });
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/api/launch/pons-schema-ready')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ready: true,
            reason: null,
            hasMarketSource: true,
            hasCurveAddress: true,
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });
  });

  it('starts on TOKEN and blocks continue until required fields are valid', () => {
    render(<LaunchFlowLive catalogue={[eth]} />);
    expect(screen.getByText(/01 \/ 03 — TOKEN/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/name is required/i)).toBeTruthy();
  });

  it('does not expose a live launch CTA on step 1', () => {
    render(<LaunchFlowLive catalogue={[eth]} />);
    expect(screen.queryByRole('button', { name: /launch token/i })).toBeNull();
  });

  it('manual launch stays blank even if assist handoff exists without ?assist=1', async () => {
    seedAssistHandoff();
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    });
    expect((screen.getByLabelText('Website (optional)') as HTMLInputElement).value).toBe('');
    expect(sessionStorage.getItem(ASSISTED_LAUNCH_HANDOFF_KEY)).toBeTruthy();
  });

  it('prefills assisted launch when ?assist=1 and consumes handoff', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff();
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    expect((screen.getByLabelText('Ticker') as HTMLInputElement).value).toBe('RATE');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toContain(
      'rate moves',
    );
    expect((screen.getByLabelText('Website (optional)') as HTMLInputElement).value).toBe(
      'https://reuters.com/a',
    );
    expect(screen.getByText(/from the news/i)).toBeTruthy();
    expect(screen.getByText(/markets react to rate decision/i)).toBeTruthy();
    const provenance = screen.getByTestId('launch-news-provenance');
    expect(provenance.getAttribute('data-source-article-id')).toBe('77');
    expect(provenance.getAttribute('data-source-draft-id')).toBe('draft-1');
    expect(screen.getByAltText('Token preview').getAttribute('src')).toBe(
      'https://signed.example/1.png',
    );
    expect(sessionStorage.getItem(ASSISTED_LAUNCH_HANDOFF_KEY)).toBeNull();
  });

  it('assist + SIWE session auto-selects PONS and locks the rail selector', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff();
    mockWalletSession.mockReturnValue({
      connected: true,
      authenticated: true,
      namespace: 'eip155',
      address: '0x35affbccc92add3fab6b515326da1433dca7cf9c',
      providerReady: true,
      authMethod: 'siwe',
      userId: 'u-evm',
    });
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    const pons = screen.getByTestId('launch-rail-pons');
    const pump = screen.getByTestId('launch-rail-pump');
    expect(pons.getAttribute('aria-pressed')).toBe('true');
    expect(pump.getAttribute('aria-pressed')).toBe('false');
    expect((pons as HTMLButtonElement).disabled).toBe(true);
    expect((pump as HTMLButtonElement).disabled).toBe(true);
  });

  it('assist + SIWS session auto-selects Pump over stale DEFAULT PONS', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff();
    mockConnectedAddress.mockReturnValue(undefined);
    mockSolanaAddress.mockReturnValue('B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu');
    mockWalletSession.mockReturnValue({
      connected: true,
      authenticated: true,
      namespace: 'solana',
      address: 'B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu',
      providerReady: true,
      authMethod: 'siws',
      userId: 'u-sol',
    });
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    await waitFor(() => {
      expect(screen.getByTestId('launch-rail-pump').getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
    expect(screen.getByTestId('launch-rail-pons').getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByText(/Create a coin on Pump.fun/i)).toBeTruthy();
    // Prefill must not require EVM address fields.
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
  });

  it('assist signed-out does not invent a Solana rail from AppKit alone', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff();
    mockConnectedAddress.mockReturnValue(undefined);
    mockSolanaAddress.mockReturnValue('B7aiVApq422h43h3wZBV7QopvYKoVXjuTMJX8DdKerCu');
    mockWalletSession.mockReturnValue({
      connected: true,
      authenticated: false,
      namespace: null,
      address: null,
      providerReady: false,
      authMethod: null,
      userId: null,
    });
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    // Without an authenticated SCOOP session, resolveNewsLaunchRail is requires_sign_in
    // and DEFAULT PONS is left in place — AppKit connection must not force Pump.
    expect(screen.getByTestId('launch-rail-pons').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByTestId('launch-rail-pump').getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('leaves Website blank when Assist article URL is incompatible', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff(nvda.quoteAsset, 'http://reuters.com/a');
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    expect((screen.getByLabelText('Website (optional)') as HTMLInputElement).value).toBe('');
    const provenance = screen.getByTestId('launch-news-provenance');
    expect(provenance.getAttribute('data-source-article-id')).toBe('77');
    expect(provenance.getAttribute('data-source-draft-id')).toBe('draft-1');
  });

  it('forces ETH pair and warns when assist recommended a non-ETH quote', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff('0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead');
    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    expect(screen.getByTestId('assist-quote-warning')).toBeTruthy();
    expect(screen.getByText(/use ETH only/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/02 \/ 03 — DEV_BUY/i)).toBeTruthy();
      // Public Pons path is ETH-fixed — pair chooser removed.
      expect(screen.getByTestId('dev-buy-amount')).toBeTruthy();
      expect(screen.getByText(/Dev buy \(ETH\)/i)).toBeTruthy();
    });
  });

  it('shows pending artwork and merges image only when ready', async () => {
    searchParams.set('assist', '1');
    sessionStorage.setItem(
      ASSISTED_LAUNCH_HANDOFF_KEY,
      JSON.stringify({
        marker: ASSISTED_LAUNCH_MARKER,
        providerArticleId: '77',
        article: {
          providerArticleId: '77',
          headline: 'Markets react to rate decision',
          sourceDomain: 'reuters.com',
          publishedAt: '2026-09-07T12:00:00.000Z',
          url: 'https://reuters.com/a',
        },
        concept: {
          id: 'concept_1',
          name: 'Market Panic',
          ticker: 'PANIC',
          description: 'Original description',
          recommendedPairAddress: nvda.quoteAsset,
          recommendedPairSymbol: 'NVDA',
          pairRationale: 'why',
          imageDirection: 'desk',
          pairEnabled: true,
        },
        draftId: 'draft-pending',
        quoteAsset: nvda.quoteAsset,
        quoteSymbol: 'NVDA',
        image: {
          source: 'pending',
          previewUrl: null,
          fileName: null,
          mimeType: null,
          byteSize: null,
          draftId: 'draft-pending',
        },
        createdAt: new Date().toISOString(),
      }),
    );

    let ready = false;
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/api/launch/pons-schema-ready')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ready: true, reason: null }),
        };
      }
      if (String(url).includes('/artwork/status')) {
        if (!ready) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ artworkStatus: 'generating' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            artworkStatus: 'ready',
            previewUrl: 'https://signed.example/ready.png',
            artworkAssetId: 'art-1',
            mimeType: 'image/png',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect(screen.getByText(/generating your token image/i)).toBeTruthy();
      expect(screen.getByText(/you can continue setting up your token/i)).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Panic Market' },
    });
    fireEvent.change(screen.getByLabelText('Website (optional)'), {
      target: { value: 'https://user-edited.example/story' },
    });

    ready = true;
    await waitFor(
      () => {
        expect(screen.getByAltText('Token preview').getAttribute('src')).toBe(
          'https://signed.example/ready.png',
        );
      },
      { timeout: 5000 },
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Panic Market');
    expect((screen.getByLabelText('Website (optional)') as HTMLInputElement).value).toBe(
      'https://user-edited.example/story',
    );
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
      'Original description',
    );
    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
    expect(screen.getByRole('button', { name: /generate another/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Website (optional)'), {
      target: { value: '' },
    });
    expect((screen.getByLabelText('Website (optional)') as HTMLInputElement).value).toBe('');
  });

  it('lets user continue to later steps while artwork generates and notifies when ready', async () => {
    searchParams.set('assist', '1');
    sessionStorage.setItem(
      ASSISTED_LAUNCH_HANDOFF_KEY,
      JSON.stringify({
        marker: ASSISTED_LAUNCH_MARKER,
        providerArticleId: '77',
        article: {
          providerArticleId: '77',
          headline: 'Markets react to rate decision',
          sourceDomain: 'reuters.com',
          publishedAt: '2026-09-07T12:00:00.000Z',
          url: 'https://reuters.com/a',
        },
        concept: {
          id: 'concept_1',
          name: 'Rate Spike',
          ticker: 'RATE',
          description: 'A market on rate moves',
          recommendedPairAddress: nvda.quoteAsset,
          recommendedPairSymbol: 'NVDA',
          pairRationale: 'why',
          imageDirection: 'desk',
          pairEnabled: true,
        },
        draftId: 'draft-pending',
        quoteAsset: nvda.quoteAsset,
        quoteSymbol: 'NVDA',
        image: {
          source: 'pending',
          previewUrl: null,
          fileName: null,
          mimeType: null,
          byteSize: null,
          draftId: 'draft-pending',
        },
        createdAt: new Date().toISOString(),
      }),
    );

    let ready = false;
    let statusPolls = 0;
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/api/launch/pons-schema-ready')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ready: true, reason: null }),
        };
      }
      if (String(url).includes('/artwork/status')) {
        statusPolls += 1;
        if (!ready) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ artworkStatus: 'generating' }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            artworkStatus: 'ready',
            previewUrl: 'https://signed.example/ready.png',
            artworkAssetId: 'art-1',
            mimeType: 'image/png',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => screen.getByText(/generating your token image/i));

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/02 \/ 03 — DEV_BUY/i)).toBeTruthy();
    });
    const pollsAfterStep2 = statusPolls;

    fireEvent.change(screen.getByTestId('dev-buy-amount'), {
      target: { value: '0.05' },
    });
    fireEvent.click(screen.getByRole('button', { name: /review/i }));
    await waitFor(() => {
      expect(screen.getByText(/03 \/ 03 — REVIEW/i)).toBeTruthy();
    });

    ready = true;
    await waitFor(
      () => {
        expect(screen.getByTestId('artwork-flow-notice')).toBeTruthy();
        expect(screen.getByText(/image generated/i)).toBeTruthy();
      },
      { timeout: 5000 },
    );
    expect(statusPolls).toBeGreaterThan(pollsAfterStep2);

    fireEvent.click(screen.getByRole('button', { name: /view image/i }));
    await waitFor(() => {
      expect(screen.getByText(/01 \/ 03 — TOKEN/i)).toBeTruthy();
      expect(screen.getByAltText('Token preview').getAttribute('src')).toBe(
        'https://signed.example/ready.png',
      );
    });
  });

  it('starts exactly one regenerate job and stays navigable', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff();

    let retries = 0;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/launch/pons-schema-ready')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ready: true, reason: null }),
        };
      }
      if (String(url).includes('/artwork/retry')) {
        retries += 1;
        const body = JSON.parse(String(init?.body ?? '{}')) as { force?: boolean };
        expect(body.force).toBe(true);
        return { ok: true, status: 200, json: async () => ({ artworkStatus: 'pending' }) };
      }
      if (String(url).includes('/artwork/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ artworkStatus: 'generating' }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => screen.getByRole('button', { name: /generate another/i }));
    fireEvent.click(screen.getByRole('button', { name: /generate another/i }));

    await waitFor(() => {
      expect(screen.getByText(/generating a new image/i)).toBeTruthy();
      expect(screen.getByText(/you can continue/i)).toBeTruthy();
    });
    expect(retries).toBe(1);
    expect(screen.queryByRole('button', { name: /generate another/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/02 \/ 03 — DEV_BUY/i)).toBeTruthy();
    });
  });

  it('keeps manual upload when late AI artwork completes', async () => {
    searchParams.set('assist', '1');
    sessionStorage.setItem(
      ASSISTED_LAUNCH_HANDOFF_KEY,
      JSON.stringify({
        marker: ASSISTED_LAUNCH_MARKER,
        providerArticleId: '77',
        article: {
          providerArticleId: '77',
          headline: 'Markets react',
          sourceDomain: 'reuters.com',
          publishedAt: '2026-09-07T12:00:00.000Z',
          url: 'https://reuters.com/a',
        },
        concept: {
          id: 'concept_1',
          name: 'Rate Spike',
          ticker: 'RATE',
          description: 'desc',
          recommendedPairAddress: nvda.quoteAsset,
          recommendedPairSymbol: 'NVDA',
          pairRationale: 'why',
          imageDirection: 'desk',
          pairEnabled: true,
        },
        draftId: 'draft-pending',
        quoteAsset: nvda.quoteAsset,
        quoteSymbol: 'NVDA',
        image: {
          source: 'pending',
          previewUrl: null,
          fileName: null,
          mimeType: null,
          byteSize: null,
          draftId: 'draft-pending',
        },
        createdAt: new Date().toISOString(),
      }),
    );

    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/artwork/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            artworkStatus: 'ready',
            previewUrl: 'https://signed.example/late-ai.png',
            artworkAssetId: 'art-late',
            mimeType: 'image/png',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    render(<LaunchFlowLive catalogue={[eth, nvda]} />);
    await waitFor(() => screen.getByText(/generating your token image/i));

    const file = new File([SQUARE_PNG], 'mine.png', {
      type: 'image/png',
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByAltText('Token preview').getAttribute('src')).toBe('blob:mock');
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByAltText('Token preview').getAttribute('src')).toBe('blob:mock');
    expect(screen.queryByAltText('Token preview')?.getAttribute('src')).not.toBe(
      'https://signed.example/late-ai.png',
    );
  });
});
