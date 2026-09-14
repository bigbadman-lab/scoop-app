/**
 * Headless replacement for AppKit `ApproveTransaction` view:
 * position/show the Reown secure `#w3m-iframe` so email SIWE / personal_sign
 * can be approved when modal UI is not injected.
 */

const PAGE_HEIGHT = 600;
const PAGE_WIDTH = 360;

export function getW3mSecureIframe(): HTMLIFrameElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('w3m-iframe');
  return el instanceof HTMLIFrameElement ? el : null;
}

/** Match scaffold-ui ApproveTransaction desktop/mobile placement. */
export function showW3mSecureIframe(): boolean {
  const iframe = getW3mSecureIframe();
  if (!iframe) return false;

  const isMobile =
    typeof window !== 'undefined' ? window.innerWidth <= 430 : false;

  // Match W3mFrame defaults + ApproveTransaction placement (above SCOOP overlays).
  iframe.style.display = 'block';
  iframe.style.position = 'fixed';
  iframe.style.zIndex = '999999';
  iframe.style.height = `${PAGE_HEIGHT}px`;
  iframe.style.border = 'none';
  iframe.style.borderBottomLeftRadius = 'clamp(0px, 16px, 44px)';
  iframe.style.borderBottomRightRadius = 'clamp(0px, 16px, 44px)';
  iframe.style.boxShadow = '0 24px 64px rgba(0,0,0,0.45)';

  if (isMobile) {
    iframe.style.width = '100%';
    iframe.style.left = '0px';
    iframe.style.right = '0px';
    iframe.style.bottom = '0px';
    iframe.style.top = 'unset';
    iframe.style.animation =
      'w3m-iframe-zoom-in-mobile 200ms ease-out';
  } else {
    iframe.style.width = `${PAGE_WIDTH}px`;
    iframe.style.left = `calc(50% - ${PAGE_WIDTH / 2}px)`;
    iframe.style.top = `calc(50% - ${PAGE_HEIGHT / 2}px)`;
    iframe.style.bottom = 'unset';
    iframe.style.right = 'unset';
    iframe.style.animation = 'w3m-iframe-zoom-in 200ms ease-out';
  }
  return true;
}

export function hideW3mSecureIframe(): void {
  const iframe = getW3mSecureIframe();
  if (!iframe) return;
  iframe.style.display = 'none';
  iframe.style.animation = 'w3m-iframe-fade-out 200ms ease-out';
}

export function isApproveTransactionView(view: string | null | undefined): boolean {
  return view === 'ApproveTransaction';
}
