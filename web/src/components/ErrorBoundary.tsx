import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Banner, Button, Link } from '../ui/primitives';

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
        <Banner
          status="error"
          title="This view failed to render"
          description={this.state.error.message}
          endContent={
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Button label="Try again" size="sm" onClick={() => this.setState({ error: null })} />
              <Link href="/">Back to systems</Link>
            </span>
          }
        />
      );
    }
    return this.props.children;
  }
}
