import { createPublicClient, http, type PublicClient } from 'viem';
import { sanitizeRpcLabel } from '../../config.js';

export type RpcSlot = 'primary' | 'fallback';

export interface FailoverRpcOptions {
  primaryUrl?: string;
  fallbackUrl: string;
  failureThreshold?: number;
  primaryRetryMs?: number;
}

/**
 * HTTP RPC failover: primary then fallback.
 * Never logs full URLs/secrets — host labels only.
 */
export class FailoverRpc {
  private readonly primaryUrl?: string;
  private readonly fallbackUrl: string;
  private readonly failureThreshold: number;
  private readonly primaryRetryMs: number;
  private primaryFailures = 0;
  private active: RpcSlot;
  private lastPrimaryRetryAt = 0;
  private client: PublicClient;

  constructor(opts: FailoverRpcOptions) {
    this.primaryUrl = opts.primaryUrl;
    this.fallbackUrl = opts.fallbackUrl;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.primaryRetryMs = opts.primaryRetryMs ?? 60_000;
    this.active = this.primaryUrl ? 'primary' : 'fallback';
    this.client = this.buildClient(this.activeUrl());
  }

  activeSlot(): RpcSlot {
    return this.active;
  }

  activeLabel(): string {
    return sanitizeRpcLabel(this.activeUrl());
  }

  getClient(): PublicClient {
    return this.client;
  }

  private activeUrl(): string {
    if (this.active === 'primary' && this.primaryUrl) return this.primaryUrl;
    return this.fallbackUrl;
  }

  private buildClient(url: string): PublicClient {
    return createPublicClient({ transport: http(url) });
  }

  private switchTo(slot: RpcSlot): void {
    if (this.active === slot) return;
    if (slot === 'primary' && !this.primaryUrl) return;
    this.active = slot;
    this.client = this.buildClient(this.activeUrl());
  }

  /** Select which slot should handle the next call (pure helper for tests). */
  selectSlot(now = Date.now()): RpcSlot {
    if (!this.primaryUrl) return 'fallback';
    if (this.active === 'fallback') {
      if (now - this.lastPrimaryRetryAt >= this.primaryRetryMs) {
        return 'primary';
      }
      return 'fallback';
    }
    return 'primary';
  }

  recordSuccess(): void {
    this.primaryFailures = 0;
  }

  recordFailure(): void {
    if (this.active === 'primary') {
      this.primaryFailures += 1;
      if (this.primaryFailures >= this.failureThreshold) {
        this.lastPrimaryRetryAt = Date.now();
        this.switchTo('fallback');
      }
    }
  }

  async withClient<T>(fn: (client: PublicClient) => Promise<T>): Promise<T> {
    const desired = this.selectSlot();
    if (desired !== this.active) {
      this.switchTo(desired);
    }
    try {
      const result = await fn(this.client);
      this.recordSuccess();
      if (this.active === 'primary') {
        this.primaryFailures = 0;
      }
      return result;
    } catch (error) {
      this.recordFailure();
      // One-shot retry on the other slot
      const other: RpcSlot =
        this.active === 'primary' || !this.primaryUrl ? 'fallback' : 'primary';
      if (other !== this.active) {
        this.switchTo(other);
        try {
          const result = await fn(this.client);
          this.recordSuccess();
          return result;
        } catch {
          throw error;
        }
      }
      throw error;
    }
  }
}

export function createFailoverRpc(opts: FailoverRpcOptions): FailoverRpc {
  return new FailoverRpc(opts);
}
