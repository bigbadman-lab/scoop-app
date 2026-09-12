import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContractCopy } from '@/components/ui/ContractCopy';

describe('ContractCopy', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('copies address and does not rely on parent navigation', async () => {
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick} role="link">
        <ContractCopy address="0x71F1234567890abcdef82A" />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: /copy contract/i }));
    expect(parentClick).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        '0x71F1234567890abcdef82A',
      );
    });
    expect(screen.getByRole('button', { name: /address copied/i })).toBeTruthy();
    expect(screen.getByTestId('contract-copy').textContent).toMatch(/✓ Copied/);
  });
});
