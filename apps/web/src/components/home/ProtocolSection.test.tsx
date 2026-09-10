import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtocolSection } from '@/components/home/ProtocolSection';

vi.mock('next/image', () => ({
  default: (props: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt} src={props.src} />
  ),
}));

describe('ProtocolSection', () => {
  it('renders locked economics copy, fee split, and marketfeeds artwork', () => {
    render(<ProtocolSection />);

    expect(screen.getByText('SCOOP ECONOMICS')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /The market feeds the market/i })).toBeTruthy();
    expect(
      screen.getByText(
        /Every trade generates fees\. SCOOP puts them back into the ecosystem, rewarding creators/i,
      ),
    ).toBeTruthy();

    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.getByText('4%')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
    expect(screen.getByText('6%')).toBeTruthy();
    expect(screen.getByText('Creator rewards')).toBeTruthy();
    expect(screen.getByText('Deployer rewards')).toBeTruthy();
    expect(screen.getByText('Protocol')).toBeTruthy();
    expect(screen.getByText('Operations')).toBeTruthy();

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('/brand/marketfeeds.webp');

    expect(screen.queryByText(/\$SCOOP/i)).toBeNull();
    expect(screen.queryByText(/\$Scoop/i)).toBeNull();
    expect(screen.queryByText(/buyback/i)).toBeNull();
    expect(screen.queryByText(/Trading \+ launch activity/i)).toBeNull();
  });
});
