/**
 * AppKit 1.8.23 `w3m-router-container` sizes its body via `--local-container-height`
 * observed from an absolutely-positioned `.page`. During EmailVerifyDevice /
 * EmailVerifyOtp transitions that observer can race to 0 while `overflow: hidden`
 * stays on — the modal header remains and the verify/OTP body is clipped away.
 *
 * SCOOP cannot patch AppKit internals; we repair the CSS variable when email
 * login views are active and the container is collapsed under real content.
 */

export const APPKIT_ROUTER_MIN_USABLE_HEIGHT_PX = 120;

export function measureAppKitRouterPageHeight(host: Element): number {
  const root = (host as HTMLElement).shadowRoot;
  if (!root) return 0;
  const page = root.querySelector('.page');
  if (!(page instanceof HTMLElement)) return 0;
  return Math.max(page.scrollHeight, page.getBoundingClientRect().height);
}

export function readAppKitRouterContainerHeight(host: Element): number {
  const el = host as HTMLElement;
  const inline = parseFloat(el.style.getPropertyValue('--local-container-height'));
  if (Number.isFinite(inline)) return inline;
  const root = el.shadowRoot;
  const container = root?.querySelector('.container');
  if (!(container instanceof HTMLElement)) return 0;
  return container.getBoundingClientRect().height;
}

export function shouldRepairAppKitRouterHeight(input: {
  pageHeight: number;
  containerHeight: number;
}): boolean {
  if (input.pageHeight < APPKIT_ROUTER_MIN_USABLE_HEIGHT_PX) return false;
  // Collapsed, or severely behind content (common mid-transition race).
  return input.containerHeight < input.pageHeight * 0.55;
}

export function applyAppKitRouterHeightRepair(
  host: Element,
  pageHeight: number,
): void {
  const el = host as HTMLElement;
  // Skip AppKit's height transition so the body appears immediately.
  el.style.setProperty('--local-duration-height', '0s');
  el.style.setProperty(
    '--local-container-height',
    `${Math.ceil(pageHeight)}px`,
  );
}

export function repairAppKitRouterHeightIfNeeded(
  doc: ParentNode = document,
): boolean {
  const host = doc.querySelector('w3m-router-container');
  if (!host) return false;
  const pageHeight = measureAppKitRouterPageHeight(host);
  const containerHeight = readAppKitRouterContainerHeight(host);
  if (!shouldRepairAppKitRouterHeight({ pageHeight, containerHeight })) {
    return false;
  }
  applyAppKitRouterHeightRepair(host, pageHeight);
  return true;
}

/**
 * Poll while email verify views are up. AppKit transitions are ~150–300ms;
 * a short interval catches the intermittent collapse without fighting normal sizing.
 */
export function startAppKitEmailModalLayoutWatch(opts?: {
  intervalMs?: number;
  document?: ParentNode;
  /** @internal test seam */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): () => void {
  const doc = opts?.document ?? document;
  const intervalMs = opts?.intervalMs ?? 100;
  const setIntervalFn = opts?.setIntervalFn ?? setInterval;
  const clearIntervalFn = opts?.clearIntervalFn ?? clearInterval;
  const setTimeoutFn = opts?.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = opts?.clearTimeoutFn ?? clearTimeout;

  const tick = () => {
    repairAppKitRouterHeightIfNeeded(doc);
  };

  tick();
  const intervalId = setIntervalFn(tick, intervalMs);
  const timeoutIds = [160, 320, 500, 900].map((ms) => setTimeoutFn(tick, ms));

  return () => {
    clearIntervalFn(intervalId);
    for (const id of timeoutIds) clearTimeoutFn(id);
  };
}
