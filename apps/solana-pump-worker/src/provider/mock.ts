/**
 * In-process mock Pump trade provider for local tests / simulation.
 * Makes zero network calls.
 */

import type {
  NormalizedPumpTradeEvent,
  PumpTradeHandler,
  PumpTradeProvider,
  PumpTradeProviderHealth,
} from './types.js';

export class MockPumpTradeProvider implements PumpTradeProvider {
  private watched = new Set<string>();
  private handlers: PumpTradeHandler[] = [];
  private status: PumpTradeProviderHealth['status'] = 'disconnected';
  private error: string | null = null;
  private closed = false;
  /** Test observability — incremented on connect/subscribe/emit paths. */
  rpcCallCount = 0;
  connectCount = 0;

  async connect(watchedMints: readonly string[]): Promise<void> {
    if (this.closed) throw new Error('MockPumpTradeProvider is closed');
    this.connectCount += 1;
    this.status = 'connecting';
    this.watched = new Set(watchedMints);
    this.status = 'connected';
    this.error = null;
  }

  async subscribeMint(mint: string): Promise<void> {
    if (this.closed) throw new Error('MockPumpTradeProvider is closed');
    this.watched.add(mint);
  }

  async unsubscribeMint(mint: string): Promise<void> {
    this.watched.delete(mint);
  }

  onTrade(handler: PumpTradeHandler): void {
    this.handlers.push(handler);
  }

  health(): PumpTradeProviderHealth {
    return { status: this.status, error: this.error };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.status = 'disconnected';
    this.watched.clear();
    this.handlers = [];
  }

  /** Push a normalized event (tests / simulation only). */
  async emit(event: NormalizedPumpTradeEvent): Promise<void> {
    if (this.closed) throw new Error('MockPumpTradeProvider is closed');
    if (!this.watched.has(event.mint)) {
      return;
    }
    for (const handler of this.handlers) {
      await handler(event);
    }
  }

  getWatchedMints(): string[] {
    return [...this.watched];
  }
}
