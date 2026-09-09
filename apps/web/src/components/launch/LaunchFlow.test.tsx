import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LaunchFlow } from '@/components/launch/LaunchFlow';
import type { PublicQuoteCatalogueItem } from '@/lib/quotes/catalogue';
import {
  ASSISTED_LAUNCH_HANDOFF_KEY,
  ASSISTED_LAUNCH_MARKER,
} from '@/lib/launch-assist/types';

const searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
}));

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock');
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
  }
});

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

function seedAssistHandoff(quoteAsset = nvda.quoteAsset) {
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

describe('LaunchFlow', () => {
  beforeEach(() => {
    sessionStorage.clear();
    searchParams.delete('assist');
  });

  it('starts on TOKEN and blocks continue until required fields are valid', () => {
    render(<LaunchFlow catalogue={[eth]} />);
    expect(screen.getByText(/01 \/ 04 — TOKEN/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText(/name is required/i)).toBeTruthy();
  });

  it('does not expose a live launch CTA on step 1', () => {
    render(<LaunchFlow catalogue={[eth]} />);
    expect(screen.queryByRole('button', { name: /launch token/i })).toBeNull();
  });

  it('manual launch stays blank even if assist handoff exists without ?assist=1', async () => {
    seedAssistHandoff();
    render(<LaunchFlow catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('');
    });
    expect(sessionStorage.getItem(ASSISTED_LAUNCH_HANDOFF_KEY)).toBeTruthy();
  });

  it('prefills assisted launch when ?assist=1 and consumes handoff', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff();
    render(<LaunchFlow catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    expect((screen.getByLabelText('Ticker') as HTMLInputElement).value).toBe('RATE');
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toContain(
      'rate moves',
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

  it('does not silently substitute an invalid recommended quote', async () => {
    searchParams.set('assist', '1');
    seedAssistHandoff('0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead');
    render(<LaunchFlow catalogue={[eth, nvda]} />);
    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Rate Spike');
    });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByText(/no longer enabled/i)).toBeTruthy();
    });
  });
});
