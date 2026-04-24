import React from 'react';
import { BaseComponentProps } from '../../../types';
import { Sidebar } from '../Sidebar';
import { SessionSidebar } from '../SessionSidebar';
import { useThemeStore, useNavigationStore } from '../../../stores';
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
  const sidebarCollapsed = useThemeStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useThemeStore((s) => s.setSidebarCollapsed);
  const activeItem = useNavigationStore((s) => s.activeItem);

  // When entering chat mode, collapse the main sidebar
  React.useEffect(() => {
    if (activeItem === 'chat') {
      setSidebarCollapsed(true);
    }
  }, [activeItem, setSidebarCollapsed]);

  const layoutClasses = [
    'layout',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    'has-session-sidebar', // Session sidebar is always shown
  ].filter(Boolean).join(' ');

  return (
    <div className={layoutClasses}>
      <Sidebar />
      <SessionSidebar />
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
