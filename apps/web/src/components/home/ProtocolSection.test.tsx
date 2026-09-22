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
  it('renders creator-reward recycling copy and mechanism cards', () => {
    render(<ProtocolSection />);

    expect(screen.getByText('SCOOP ECONOMICS')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /The market feeds the market/i })).toBeTruthy();
    expect(
      screen.getByText(/SCOOP earns creator rewards from its own native token/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/strategic onchain buys funded by SCOOP's creator rewards/i),
    ).toBeTruthy();

    expect(screen.getByText('AI SCANS')).toBeTruthy();
    expect(screen.getByText('MARKETS RANK')).toBeTruthy();
    expect(screen.getByText('SCOOP DEPLOYS')).toBeTruthy();
    expect(screen.getByText('VALUE RECYCLES')).toBeTruthy();
    expect(screen.getAllByTestId('protocol-mechanism-card')).toHaveLength(4);

    expect(screen.queryByText('70%')).toBeNull();
    expect(screen.queryByText('4%')).toBeNull();
    expect(screen.queryByText('20%')).toBeNull();
    expect(screen.queryByText('6%')).toBeNull();
    expect(screen.queryByText('Deployer rewards')).toBeNull();
    expect(screen.queryByText(/Every trade generates fees/i)).toBeNull();

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('/brand/marketfeeds.webp');

    expect(screen.queryByText(/\$SCOOP/i)).toBeNull();
    expect(screen.queryByText(/buyback/i)).toBeNull();
  });
});
