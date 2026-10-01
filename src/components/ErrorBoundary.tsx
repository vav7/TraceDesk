import { Component, ErrorInfo, ReactNode } from 'react';
import { TriangleAlert, RotateCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes so the app degrades to a recovery screen
 * instead of unmounting to a blank (black/white) page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('TraceDesk UI crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="td-card w-full max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-card border border-danger/25 bg-danger/10 text-danger-ink">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-display font-semibold text-text-1">Something went wrong</h1>
          <p className="mt-2 text-body leading-6 text-text-2">
            The interface hit an unexpected error. Your data is safe. Reload to continue.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-ctl border border-line bg-inset p-3 text-left font-mono text-mono-body leading-5 text-text-3">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="td-btn-primary m-press mt-6 w-full"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" /> Reload page
          </button>
        </div>
      </div>
    );
  }
}
