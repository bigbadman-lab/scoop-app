import { RouterController } from '@reown/appkit-controllers';

/**
 * Observe AppKit modal router view via supported controller API.
 * Prefer this over DOM scraping or modal copy matching.
 */
export function getAppKitRouterView(): string {
  return RouterController.state.view;
}

export function subscribeAppKitRouterView(
  callback: (view: string) => void,
): () => void {
  callback(RouterController.state.view);
  return RouterController.subscribeKey('view', (view) => {
    callback(view);
  });
}
