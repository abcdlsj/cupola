import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';

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
        <div role="alert">
          <Banner
            status="error"
            collapsible={false}
            title="This view failed to render"
            description={this.state.error.message}
            endContent={
              <HStack gap={3} vAlign="center">
                <Button label="Try again" variant="secondary" size="sm" onClick={() => this.setState({ error: null })} />
                <Link href="/">Back to systems</Link>
              </HStack>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
