import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountPagePending } from '@/components/account/AccountPagePending';

describe('AccountPagePending', () => {
  it('uses account shell geometry, not Join SCOOP', () => {
    render(<AccountPagePending />);
    expect(screen.getByLabelText(/loading account/i)).toBeTruthy();
    expect(screen.getByText(/^account$/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /your account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /join scoop/i })).toBeNull();
  });
});
