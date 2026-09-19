import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gate 7 isolation: public /launch must use Pons + HoodLock, not ScoopFactory write.
 */
describe('Gate 7 public Pons launch isolation', () => {
  const livePath = join(
    __dirname,
    '../../../../components/launch/LaunchFlowLive.tsx',
  );
  const pagePath = join(__dirname, '../../../../app/launch/page.tsx');
  const publicOrchPath = join(__dirname, '../../run-public-pons-launch.ts');
  const scoopOrchPath = join(__dirname, '../../orchestrate.ts');

  it('LaunchFlowLive wires Pons + HoodLock public orchestrator', () => {
    const src = readFileSync(livePath, 'utf8');
    expect(src).toContain("from '@/lib/launch/run-public-pons-launch'");
    expect(src).toContain('runPublicPonsLaunch');
    expect(src).toContain('resumePublicPonsLaunch');
    expect(src).toContain('DevBuyStep');
    expect(src).not.toContain("from '@/lib/launch/orchestrate'");
    expect(src).not.toContain('runWalletLaunch');
    expect(src).not.toContain('MarketStep');
    expect(src).not.toContain('EarningsStep');
    expect(src).not.toContain('canLaunchCanonicalProduction');
  });

  it('public run-public-pons-launch composes Gate 4/5 orchestrators', () => {
    const src = readFileSync(publicOrchPath, 'utf8');
    expect(src).toContain('createOrResumePonsDraft');
    expect(src).toContain('preparePonsLaunchAndBuy');
    expect(src).toContain('broadcastPonsLaunchAndBuy');
    expect(src).toContain('prepareHoodlockLock');
    expect(src).toContain('broadcastHoodlockLock');
    expect(src).toContain('PONS_SCHEMA_BLOCKED_MESSAGE');
  });

  it('launch page still mounts LaunchFlow shell (no Scoop write import)', () => {
    const src = readFileSync(pagePath, 'utf8');
    expect(src).toContain('LaunchFlow');
    expect(src).not.toContain('runWalletLaunch');
    expect(src).not.toContain('orchestrate');
  });

  it('legacy Scoop orchestrate remains in repo but is not the public path', () => {
    const src = readFileSync(scoopOrchPath, 'utf8');
    expect(src).toContain('writeLaunchAfterSimulation');
    expect(src).toContain("from '@/lib/launch/execute'");
    expect(src).not.toContain('broadcastPonsLaunchAndBuy');
  });
});
