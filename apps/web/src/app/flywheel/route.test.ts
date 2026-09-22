import { describe, expect, it } from 'vitest';
import { GET } from '@/app/flywheel/route';

describe('GET /flywheel', () => {
  it('permanently redirects to docs §24 with hash preserved', async () => {
    const response = GET(new Request('https://scoop.fun/flywheel'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://scoop.fun/docs#24-creator-rewards-power-stronger-markets',
    );
  });
});
