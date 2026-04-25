import { Component, type ReactNode, type ErrorInfo } from 'react';
import { logger } from '../lib/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** When true, renders a compact fallback instead of full-screen. Useful for page-level boundaries. */
  inline?: boolean;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.inline) {
        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            minHeight: '200px',
            padding: '32px 24px',
            fontFamily: 'system-ui, sans-serif',
            color: '#e0e0e0',
          }}>
            <span style={{ fontSize: '2rem', marginBottom: '8px' }}>⚠️</span>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '8px', color: '#ff6b6b' }}>Page Error</h2>
            <p style={{ color: '#999', marginBottom: '16px', textAlign: 'center', fontSize: '0.85rem' }}>
              {this.state.error?.message || 'An unexpected error occurred on this page.'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                background: '#4a6cf7',
                color: '#fff',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        );
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: '24px',
          fontFamily: 'system-ui, sans-serif',
          color: '#e0e0e0',
          background: '#1a1a2e',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '12px' }}>Something went wrong</h1>
          <p style={{ color: '#999', marginBottom: '20px', textAlign: 'center', maxWidth: '480px' }}>
            An unexpected error occurred. Please try restarting the application.
          </p>
          <pre style={{
            background: '#2a2a3e',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.8rem',
            maxWidth: '100%',
            overflow: 'auto',
            marginBottom: '20px',
            color: '#ff6b6b',
          }}>
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: '#4a6cf7',
              color: '#fff',
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
