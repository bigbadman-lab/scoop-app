/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import {
  applyAppKitRouterHeightRepair,
  repairAppKitRouterHeightIfNeeded,
  shouldRepairAppKitRouterHeight,
  startAppKitEmailModalLayoutWatch,
} from '@/lib/auth/repair-appkit-router-height';

describe('shouldRepairAppKitRouterHeight', () => {
  it('does not repair when page content is not ready', () => {
    expect(
      shouldRepairAppKitRouterHeight({ pageHeight: 40, containerHeight: 0 }),
    ).toBe(false);
  });

  it('repairs when container collapsed under real email-view content', () => {
    expect(
      shouldRepairAppKitRouterHeight({ pageHeight: 280, containerHeight: 0 }),
    ).toBe(true);
    expect(
      shouldRepairAppKitRouterHeight({ pageHeight: 280, containerHeight: 48 }),
    ).toBe(true);
  });

  it('leaves healthy heights alone', () => {
    expect(
      shouldRepairAppKitRouterHeight({ pageHeight: 280, containerHeight: 280 }),
    ).toBe(false);
    expect(
      shouldRepairAppKitRouterHeight({ pageHeight: 280, containerHeight: 260 }),
    ).toBe(false);
  });
});

describe('applyAppKitRouterHeightRepair', () => {
  it('forces container height and disables height transition', () => {
    const host = document.createElement('div');
    applyAppKitRouterHeightRepair(host, 312.4);
    expect(host.style.getPropertyValue('--local-duration-height')).toBe('0s');
    expect(host.style.getPropertyValue('--local-container-height')).toBe('313px');
  });
});

describe('repairAppKitRouterHeightIfNeeded', () => {
  it('no-ops when router host is missing', () => {
    const root = document.createElement('div');
    expect(repairAppKitRouterHeightIfNeeded(root)).toBe(false);
  });

  it('repairs a collapsed shadow router container', () => {
    const root = document.createElement('div');
    const host = document.createElement('w3m-router-container') as HTMLElement;
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    container.className = 'container';
    const page = document.createElement('div');
    page.className = 'page';
    Object.defineProperty(page, 'scrollHeight', { value: 300 });
    page.getBoundingClientRect = () =>
      ({
        height: 300,
        width: 360,
        top: 0,
        left: 0,
        bottom: 300,
        right: 360,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    container.appendChild(page);
    shadow.appendChild(container);
    host.style.setProperty('--local-container-height', '0px');
    root.appendChild(host);

    expect(repairAppKitRouterHeightIfNeeded(root)).toBe(true);
    expect(host.style.getPropertyValue('--local-container-height')).toBe('300px');
  });
});

describe('startAppKitEmailModalLayoutWatch', () => {
  it('starts interval + delayed ticks and cleans up', () => {
    const setIntervalFn = vi.fn(() => 11 as unknown as ReturnType<typeof setInterval>);
    const clearIntervalFn = vi.fn();
    const setTimeoutFn = vi.fn(() => 22 as unknown as ReturnType<typeof setTimeout>);
    const clearTimeoutFn = vi.fn();

    const stop = startAppKitEmailModalLayoutWatch({
      document: document.createElement('div'),
      setIntervalFn: setIntervalFn as unknown as typeof setInterval,
      clearIntervalFn: clearIntervalFn as unknown as typeof clearInterval,
      setTimeoutFn: setTimeoutFn as unknown as typeof setTimeout,
      clearTimeoutFn: clearTimeoutFn as unknown as typeof clearTimeout,
    });

    expect(setIntervalFn).toHaveBeenCalled();
    expect(setTimeoutFn).toHaveBeenCalledTimes(4);
    stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(11);
    expect(clearTimeoutFn).toHaveBeenCalledTimes(4);
  });
});
