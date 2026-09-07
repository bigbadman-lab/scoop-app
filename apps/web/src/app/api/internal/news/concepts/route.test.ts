import { beforeEach, describe, expect, it, vi } from 'vitest';

const assertInternalAccess = vi.fn();
const rateLimitInternal = vi.fn();
const clientIp = vi.fn();
const generateLaunchConcepts = vi.fn();
const createPool = vi.fn();

vi.mock('@scoop/db', () => ({
  createPool: (...args: unknown[]) => createPool(...args),
}));

vi.mock('@scoop/news', () => {
  class ConceptValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ConceptValidationError';
    }
  }
  return {
    ConceptValidationError,
    generateLaunchConcepts: (...args: unknown[]) => generateLaunchConcepts(...args),
  };
});

vi.mock('@/lib/server/internal-auth', () => ({
  assertInternalAccess: (...args: unknown[]) => assertInternalAccess(...args),
  rateLimitInternal: (...args: unknown[]) => rateLimitInternal(...args),
  clientIp: (...args: unknown[]) => clientIp(...args),
}));

describe('POST /api/internal/news/concepts remains protected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DATABASE_URL = 'postgres://test';
    rateLimitInternal.mockReturnValue(true);
    clientIp.mockReturnValue('127.0.0.1');
    createPool.mockReturnValue({ end: vi.fn().mockResolvedValue(undefined) });
  });

  it('invokes assertInternalAccess before generation', async () => {
    const { ValidationError } = await import('@/lib/server/validate');
    assertInternalAccess.mockImplementation(() => {
      throw new ValidationError('Unauthorized');
    });
    const { POST } = await import('@/app/api/internal/news/concepts/route');
    const res = await POST(
      new Request('http://localhost/api/internal/news/concepts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerArticleId: '77' }),
      }),
    );
    expect(assertInternalAccess).toHaveBeenCalled();
    expect(res.status).toBe(401);
    expect(generateLaunchConcepts).not.toHaveBeenCalled();
  });
});
