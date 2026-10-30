/**
 * Error boundaries for the app's subtrees (task 15.6; design Error Handling,
 * D-58; Requirement 40.4).
 *
 * `ErrorBoundary` catches a render or lifecycle error in its children, logs it
 * with `console.warn` (never `console.error`, which the E2E tests treat as a
 * failure) and renders `fallback` instead. It starts over when `resetKey`
 * changes or when the fallback calls `reset()`.
 *
 * `RecoveryNotice` is the friendly fallback: a short message, a "Back to
 * menu" button and an optional "Try again" button. The App decides what
 * "Back to menu" does for each subtree (see `App.tsx`).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/components/ui/button';

export interface ErrorBoundaryProps {
  /** Short name used in the warning, e.g. "main menu". */
  name: string;
  /** Rendered after an error; `reset` clears the error and renders the children again. */
  fallback: (reset: () => void) => ReactNode;
  /** A change of this value clears a caught error. */
  resetKey?: unknown;
  children?: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
  resetKey: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    if (Object.is(props.resetKey, state.resetKey)) return null;
    return { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.warn(`The ${this.props.name} stopped because of an unexpected error.`, error, info.componentStack);
  }

  private readonly reset = () => this.setState({ failed: false });

  render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}

export const RECOVERY_MESSAGE = 'Something went wrong.';
export const BACK_TO_MENU_LABEL = 'Back to menu';
export const TRY_AGAIN_LABEL = 'Try again';

export interface RecoveryNoticeProps {
  /** Extra sentence under the main message. */
  detail?: string;
  onBackToMenu: () => void;
  onTryAgain?: () => void;
  className?: string;
}

/** Fallback panel with a way back to the menu. */
export function RecoveryNotice({ detail, onBackToMenu, onTryAgain, className }: RecoveryNoticeProps) {
  return (
    <div
      role="alert"
      data-testid="error-fallback"
      className={cn('panel max-w-md flex-col items-center gap-3 text-center', className)}
    >
      <p className="text-base font-semibold">{RECOVERY_MESSAGE}</p>
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
      <div className="flex gap-2">
        {onTryAgain && (
          <Button variant="outline" onClick={onTryAgain}>
            {TRY_AGAIN_LABEL}
          </Button>
        )}
        <Button onClick={onBackToMenu}>{BACK_TO_MENU_LABEL}</Button>
      </div>
    </div>
  );
}
