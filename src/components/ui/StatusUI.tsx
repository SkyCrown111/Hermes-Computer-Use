import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

const sizeMap = { sm: '16px', md: '24px', lg: '40px' };

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', message, className = '' }) => (
  <div className={`loading-container ${className}`}>
    <div className="loading-spinner" style={{ width: sizeMap[size], height: sizeMap[size] }} />
    {message && <p className="loading-message">{message}</p>}
  </div>
);

interface ErrorBannerProps {
  message: string | null | undefined;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onRetry, onDismiss, className = '' }) => {
  if (!message) return null;
  return (
    <div className={`error-banner ${className}`}>
      <span className="error-banner-message">{message}</span>
      <div className="error-banner-actions">
        {onRetry && <button className="error-banner-retry" onClick={onRetry}>Retry</button>}
        {onDismiss && <button className="error-banner-dismiss" onClick={onDismiss}>✕</button>}
      </div>
    </div>
  );
};

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className = '' }) => (
  <div className={`empty-state ${className}`}>
    {icon && <div className="empty-state-icon">{icon}</div>}
    <h3 className="empty-state-title">{title}</h3>
    {description && <p className="empty-state-description">{description}</p>}
    {action && <button className="empty-state-action" onClick={action.onClick}>{action.label}</button>}
  </div>
);

interface PageWrapperProps {
  title?: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  children: React.ReactNode;
  className?: string;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ title, isLoading, error, onRetry, children, className = '' }) => (
  <div className={`page-wrapper ${className}`}>
    {title && <div className="page-header"><h1>{title}</h1></div>}
    <ErrorBanner message={error} onRetry={onRetry} />
    {isLoading ? <LoadingSpinner message="Loading..." /> : children}
  </div>
);
