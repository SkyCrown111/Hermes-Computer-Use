import React from 'react';
import { BaseComponentProps } from '../../../types';
import { Sidebar } from '../Sidebar';
import './Layout.css';

export interface LayoutProps extends BaseComponentProps {
  title?: string;
  actions?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  title,
  actions,
  className = '',
  children,
}) => {
  return (
    <div className="layout">
      <Sidebar />
      <main className="layout-main">
        {(title || actions) && (
          <header className="layout-header">
            {title && <h1 className="layout-title">{title}</h1>}
            {actions && <div className="layout-actions">{actions}</div>}
          </header>
        )}
        <div className={`layout-content ${className}`}>{children}</div>
      </main>
    </div>
  );
};

export interface PageHeaderProps extends BaseComponentProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; path?: string }>;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
}) => {
  return (
    <div className="page-header">
      <div className="page-header-left">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="breadcrumbs">
            {breadcrumbs.map((crumb, index) => (
              <span key={index} className="breadcrumb-item">
                {index > 0 && <span className="breadcrumb-separator">/</span>}
                {crumb.path ? (
                  <a href={crumb.path} className="breadcrumb-link">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="breadcrumb-current">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
};
