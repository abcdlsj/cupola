import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * A page whose render throws must not blank the whole app: keep the shell and
 * show the failure inside the content area with a way out.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('page render failed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="panel" role="alert">
          <div className="panel-body">
            <h2 className="panel-title">This view failed to render</h2>
            <p className="note" style={{ marginTop: 8 }}>
              {this.state.error.message}
            </p>
            <div className="form-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
              <a className="btn btn-quiet" href="/">
                Back to the overview
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
