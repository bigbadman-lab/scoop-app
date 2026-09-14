import { describe, expect, it, vi, afterEach } from 'vitest';

vi.mock('@/lib/protocol/load-stats', () => ({
  loadProtocolStatsSafe: vi.fn(),
  emptyProtocolStats: () => ({
    status: 'degraded',
    updatedAt: new Date().toISOString(),
    marketsLaunched: 0,
    totalTrades: 0,
    totalVolumeUsd: null,
    totalFeesUsd: null,
    protocolBuybackFeesUsd: null,
    feeSemantics: 'distributed_marked_to_market',
    feeCoverage: 'unavailable',
    tradesMissingUsd: 0,
    tape: { contractAddress: null },
    message: 'Protocol stats temporarily unavailable',
  }),
}));

import { GET } from '@/app/api/protocol/stats/route';
import { loadProtocolStatsSafe } from '@/lib/protocol/load-stats';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/protocol/stats', () => {
  it('returns required fields including tape.contractAddress on success', async () => {
    vi.mocked(loadProtocolStatsSafe).mockResolvedValue({
      status: 'ok',
      updatedAt: '2026-09-14T12:00:00.000Z',
      marketsLaunched: 2,
      totalTrades: 9,
      totalVolumeUsd: '100.5',
      totalFeesUsd: '1.2',
      protocolBuybackFeesUsd: '0.24',
      feeSemantics: 'distributed_marked_to_market',
      feeCoverage: 'complete',
      tradesMissingUsd: 0,
      tape: {
        contractAddress: '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C',
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.marketsLaunched).toBe(2);
    expect(body.totalTrades).toBe(9);
    expect(body.totalVolumeUsd).toBe('100.5');
    expect(body.totalFeesUsd).toBe('1.2');
    expect(body.protocolBuybackFeesUsd).toBe('0.24');
    expect(body.updatedAt).toBeTruthy();
    expect(body.feeSemantics).toBe('distributed_marked_to_market');
    expect(body.tape.contractAddress).toBe(
      '0x4B227d5E6199f42ceA4e638875fF8C740757DD3C',
    );
  });

  it('returns null tape.contractAddress when unset', async () => {
    vi.mocked(loadProtocolStatsSafe).mockResolvedValue({
      status: 'ok',
      updatedAt: '2026-09-14T12:00:00.000Z',
      marketsLaunched: 0,
      totalTrades: 0,
      totalVolumeUsd: null,
      totalFeesUsd: null,
      protocolBuybackFeesUsd: null,
      feeSemantics: 'distributed_marked_to_market',
      feeCoverage: 'unavailable',
      tradesMissingUsd: 0,
      tape: { contractAddress: null },
    });

    const res = await GET();
    const body = await res.json();
    expect(body.tape.contractAddress).toBeNull();
  });

  it('returns degraded shape without throwing', async () => {
    vi.mocked(loadProtocolStatsSafe).mockResolvedValue({
      status: 'degraded',
      updatedAt: '2026-09-14T12:00:00.000Z',
      marketsLaunched: 0,
      totalTrades: 0,
      totalVolumeUsd: null,
      totalFeesUsd: null,
      protocolBuybackFeesUsd: null,
      feeSemantics: 'distributed_marked_to_market',
      feeCoverage: 'unavailable',
      tradesMissingUsd: 0,
      tape: { contractAddress: null },
      message: 'Protocol stats temporarily unavailable',
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.totalVolumeUsd).toBeNull();
    expect(body.tape.contractAddress).toBeNull();
  });
});
