import React from 'react';
import { BaseComponentProps } from '../../../types';
import { Sidebar } from '../Sidebar';
import { SessionSidebar } from '../SessionSidebar';
import { StatusBar } from '../StatusBar';
import { KeyboardShortcutsHelp } from '../../ui/KeyboardShortcutsHelp';
import { useThemeStore, useNavigationStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import './Layout.css';

// Hamburger Menu Icon
function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

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
  const toggleMobileSidebar = useThemeStore((s) => s.toggleMobileSidebar);
  const activeItem = useNavigationStore((s) => s.activeItem);
  const { t } = useTranslation();

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

  // Get page title based on active item
  const getPageTitle = () => {
    const titles: Record<string, string> = {
      dashboard: t('nav.home'),
      sessions: t('nav.sessions'),
      skills: t('nav.skills'),
      tasks: t('nav.tasks'),
      settings: t('nav.settings'),
      monitor: t('nav.monitor'),
      memory: t('nav.memory'),
      platforms: t('nav.platforms'),
      gateway: 'Gateway',
      files: t('nav.files'),
      preferences: t('nav.preferences'),
    };
    return titles[activeItem] || 'Hermes';
  };

  return (
    <div className={layoutClasses}>
      <Sidebar />
      <SessionSidebar />
      <main className="layout-main">
        {/* Mobile Header */}
        <div className="mobile-header">
          <button className="hamburger-btn" onClick={toggleMobileSidebar} aria-label="Open menu">
            <MenuIcon />
          </button>
          <span className="mobile-header-title">{getPageTitle()}</span>
          {actions && <div className="mobile-actions">{actions}</div>}
        </div>

        {(title || actions) && (
          <header className="layout-header">
            {title && <h1 className="layout-title">{title}</h1>}
            {actions && <div className="layout-actions">{actions}</div>}
          </header>
        )}
        <div className={`layout-content ${className}`}>{children}</div>
      </main>
      <StatusBar />
      <KeyboardShortcutsHelp />
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
