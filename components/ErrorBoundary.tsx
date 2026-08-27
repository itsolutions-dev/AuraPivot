import React from 'react';
import { Alert, AlertTitle, Box, Button } from '@mui/material';

/**
 * Error boundary for the grid subtree.
 *
 * A render-time exception anywhere under `<PivotTable>` (a malformed matrix,
 * a broken conditional-format rule, a consumer-supplied formatter that throws)
 * would otherwise unmount the whole host application — React tears down the
 * entire tree when nothing catches. try/catch cannot help here: it does not
 * see errors thrown during render.
 *
 * Retry remounts the subtree: the engine keeps its state, so the user can
 * undo whatever they configured last and carry on without a page reload.
 */

export interface ErrorBoundaryProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  /** Bumped on retry to force a fresh subtree. */
  attempt: number;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[AuraPivot] grid render failed', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({ error: null, attempt: prev.attempt + 1 }));
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return (
        <React.Fragment key={this.state.attempt}>
          {this.props.children}
        </React.Fragment>
      );
    }
    const { title, message, retryLabel } = this.props;
    return (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={this.handleRetry}>
              {retryLabel || 'Retry'}
            </Button>
          }
        >
          <AlertTitle>{title || 'Something went wrong'}</AlertTitle>
          {message || error.message || 'The pivot grid could not be rendered.'}
        </Alert>
      </Box>
    );
  }
}

export default ErrorBoundary;
