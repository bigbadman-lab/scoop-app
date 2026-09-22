import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import AboutPage from '@/app/about/page';

describe('About page', () => {
  it('renders the strong-narratives creator-reward section', () => {
    render(<AboutPage />);

    expect(screen.getByTestId('about-strong-narratives')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: /Strong narratives should have an edge/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/strategic onchain buys funded by creator rewards/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/news → narrative → launch → AI evaluation → selective onchain buys/i),
    ).toBeTruthy();
  });
});
