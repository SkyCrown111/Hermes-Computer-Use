import { Component, type ReactNode, type ErrorInfo } from 'react';
import { logger } from '../lib/logger';
import { t } from '../lib/i18n';
import { Button } from './ui/Button';
import { useThemeStore } from '../stores';
import './ErrorBoundary.css';

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

// Get current language from store or default to 'zh'
const getLanguage = () => useThemeStore.getState().language || 'zh';

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
      const lang = getLanguage();

      if (this.props.inline) {
        return (
          <div className="error-boundary error-boundary-inline">
            <span className="error-boundary-icon" aria-hidden="true">!</span>
            <h2 className="error-boundary-heading error-boundary-heading-inline">
              {t('errorBoundary.pageError', lang)}
            </h2>
            <p className="error-boundary-text error-boundary-text-inline">
              {this.state.error?.message || t('errorBoundary.pageDescription', lang)}
            </p>
            <Button variant="primary" size="md" onClick={this.handleReset}>
              {t('errorBoundary.retry', lang)}
            </Button>
          </div>
        );
      }

      return (
        <div className="error-boundary error-boundary-fullscreen">
          <h1 className="error-boundary-heading">
            {t('errorBoundary.title', lang)}
          </h1>
          <p className="error-boundary-text">
            {t('errorBoundary.description', lang)}
          </p>
          <pre className="error-boundary-code">
            {this.state.error?.message}
          </pre>
          <Button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            variant="primary"
            size="lg"
          >
            {t('errorBoundary.reload', lang)}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
