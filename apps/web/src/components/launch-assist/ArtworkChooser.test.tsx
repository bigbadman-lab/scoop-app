import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ArtworkChooser } from '@/components/launch-assist/ArtworkChooser';

beforeAll(() => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:upload');
  }
});

const article = {
  providerArticleId: '77',
  headline: 'Markets react to rate decision',
  sourceDomain: 'reuters.com',
  publishedAt: '2026-09-07T12:00:00.000Z',
  url: 'https://reuters.com/a',
};

const concept = {
  id: 'concept_1' as const,
  name: 'Rate Spike',
  ticker: 'RATE',
  description: 'desc',
  recommendedPairAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  recommendedPairSymbol: 'NVDA',
  pairRationale: 'why',
  imageDirection: 'desk',
  pairEnabled: true,
};

const images = [
  {
    assetId: 'a1',
    index: 1 as const,
    previewUrl: 'https://signed.example/1.png',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
  },
  {
    assetId: 'a2',
    index: 2 as const,
    previewUrl: 'https://signed.example/2.png',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
  },
  {
    assetId: 'a3',
    index: 3 as const,
    previewUrl: 'https://signed.example/3.png',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
  },
];

describe('ArtworkChooser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three images and disables continue until selection', () => {
    const onContinue = vi.fn();
    render(
      <ArtworkChooser
        article={article}
        concept={concept}
        draftId="draft-1"
        images={images}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText(/choose your look/i)).toBeTruthy();
    expect(screen.getByLabelText(/select artwork 01/i)).toBeTruthy();
    expect(screen.getByLabelText(/select artwork 02/i)).toBeTruthy();
    expect(screen.getByLabelText(/select artwork 03/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /continue/i }).hasAttribute('disabled')).toBe(
      true,
    );

    fireEvent.click(screen.getByLabelText(/select artwork 01/i));
    expect(screen.getByLabelText(/select artwork 01/i).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByLabelText(/select artwork 02/i));
    expect(screen.getByLabelText(/select artwork 01/i).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByLabelText(/select artwork 02/i).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'generated',
        artworkAssetId: 'a2',
        previewUrl: 'https://signed.example/2.png',
      }),
    );
  });

  it('allows custom upload to override generated selection', () => {
    const onContinue = vi.fn();
    const { container } = render(
      <ArtworkChooser
        article={article}
        concept={concept}
        draftId="draft-1"
        images={images}
        onContinue={onContinue}
      />,
    );
    fireEvent.click(screen.getByLabelText(/select artwork 01/i));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'custom.png', {
      type: 'image/png',
    });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/selected upload/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'upload', fileName: 'custom.png' }),
    );

    fireEvent.click(screen.getByLabelText(/select artwork 03/i));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onContinue).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'generated', artworkAssetId: 'a3' }),
    );
  });
});
