import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TokenWidgetErrorBoundary } from '@/components/token/TokenWidgetErrorBoundary';

function Boom(): never {
  throw new Error('widget boom');
}

describe('TokenWidgetErrorBoundary', () => {
  it('contains child throw and shows fallback without breaking siblings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <TokenWidgetErrorBoundary name="test-widget">
          <Boom />
        </TokenWidgetErrorBoundary>
        <p data-testid="sibling">still here</p>
      </div>,
    );
    expect(screen.getByTestId('token-widget-error-test-widget').textContent).toMatch(
      /unavailable/i,
    );
    expect(screen.getByTestId('sibling').textContent).toBe('still here');
    spy.mockRestore();
  });
});
