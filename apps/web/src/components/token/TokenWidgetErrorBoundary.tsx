'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Short label for diagnostics / test id. */
  name: string;
  fallback?: ReactNode;
};

type State = { hasError: boolean };

/**
 * Narrow client boundary for optional token-page widgets.
 * Prevents one non-critical panel from blanking the whole market page.
 */
export class TokenWidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[token-widget:${this.props.name}]`, error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="rounded-[var(--radius-lg)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-3 py-3 font-mono text-[11px] text-[var(--muted)]"
          role="status"
          data-testid={`token-widget-error-${this.props.name}`}
        >
          This panel is unavailable right now.
        </div>
      );
    }
    return this.props.children;
  }
}
