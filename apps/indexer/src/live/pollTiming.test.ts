import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig, publicConfigView } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('rpc idle poll timing (5s throttle)', () => {
  it('defaults SCOOP_POLL_INTERVAL_MS and SCOOP_LIVE_POLL_MS to 5000', () => {
    const config = loadConfig({ SCOOP_CHAIN_ID: '4663' });
    expect(config.SCOOP_POLL_INTERVAL_MS).toBe(5000);
    expect(config.SCOOP_LIVE_POLL_MS).toBe(5000);
    expect(config.SCOOP_LIVE_OVERLAY_ENABLED).toBe(true);
    expect(publicConfigView(config).pollIntervalMs).toBe(5000);
    expect(publicConfigView(config).livePollMs).toBe(5000);
  });

  it('does not clamp SCOOP_POLL_INTERVAL_MS=5000 (or higher) back to 500', () => {
    const five = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_POLL_INTERVAL_MS: '5000',
    });
    expect(five.SCOOP_POLL_INTERVAL_MS).toBe(5000);

    const ten = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_POLL_INTERVAL_MS: '10000',
    });
    expect(ten.SCOOP_POLL_INTERVAL_MS).toBe(10000);
  });

  it('resolves explicit SCOOP_LIVE_POLL_MS=5000', () => {
    const config = loadConfig({
      SCOOP_CHAIN_ID: '4663',
      SCOOP_LIVE_POLL_MS: '5000',
      SCOOP_LIVE_OVERLAY_ENABLED: 'true',
    });
    expect(config.SCOOP_LIVE_POLL_MS).toBe(5000);
    expect(config.SCOOP_LIVE_OVERLAY_ENABLED).toBe(true);
  });

  it('canonical runner idle sleep uses SCOOP_POLL_INTERVAL_MS with no hard-cap', () => {
    const src = readFileSync(join(here, 'runner.ts'), 'utf8');
    expect(src).not.toMatch(/Math\.min\(\s*config\.SCOOP_POLL_INTERVAL_MS/);
    expect(src).toMatch(/setTimeout\(\s*r\s*,\s*config\.SCOOP_POLL_INTERVAL_MS\s*\)/);
  });

  it('canonical runner only sleeps on the idle-at-tip branch (catch-up unthrottled)', () => {
    const src = readFileSync(join(here, 'runner.ts'), 'utf8');
    const idleSleepIdx = src.indexOf('setTimeout(r, config.SCOOP_POLL_INTERVAL_MS)');
    expect(idleSleepIdx).toBeGreaterThan(-1);

    // Skip past the idle setTimeout line; catch-up must not reintroduce poll sleeps.
    const afterIdleLine = src.slice(idleSleepIdx).split('\n').slice(1).join('\n');
    const processFastIdx = afterIdleLine.indexOf('processFastCatchupRange');
    expect(processFastIdx).toBeGreaterThan(-1);
    const betweenIdleAndFast = afterIdleLine.slice(0, processFastIdx);
    expect(betweenIdleAndFast).not.toMatch(/SCOOP_POLL_INTERVAL_MS/);
    expect(betweenIdleAndFast).not.toMatch(/setTimeout\s*\(/);
  });

  it('live overlay waits on SCOOP_LIVE_POLL_MS only after reaching tip', () => {
    const src = readFileSync(join(here, 'tipOverlay/observer.ts'), 'utf8');
    expect(src).toMatch(/Never throttle catch-up/);
    expect(src).toMatch(
      /if \(fromBlock > latest \|\| toBlock >= latest\) \{\s*await wait\(config\.SCOOP_LIVE_POLL_MS/,
    );
  });
});
