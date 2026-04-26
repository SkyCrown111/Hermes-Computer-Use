import React from 'react';
import { NavItem } from '../../../types';
import { useNavigationStore, useThemeStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { logger } from '../../../lib/logger';
import './Sidebar.css';

// SVG Icons
function HomeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SkillsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function MemoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function PlatformsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  );
}

function GatewayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="9" x2="12" y2="3" />
      <line x1="15" y1="12" x2="21" y2="12" />
      <line x1="12" y1="15" x2="12" y2="21" />
      <line x1="9" y1="12" x2="3" y2="12" />
    </svg>
  );
}

function FilesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PreferencesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export const Sidebar: React.FC = () => {
  const { activeItem, setActiveItem, openChat } = useNavigationStore();
  const { sidebarCollapsed, toggleSidebar, mobileSidebarOpen, setMobileSidebarOpen } = useThemeStore();
  const { t } = useTranslation();

  // Navigation items with translated labels
  const navItems: NavItem[] = [
    { id: 'dashboard', label: t('nav.home'), icon: <HomeIcon />, path: '/' },
    { id: 'sessions', label: t('nav.sessions'), icon: <ChatIcon />, path: '/sessions' },
    { id: 'skills', label: t('nav.skills'), icon: <SkillsIcon />, path: '/skills' },
    { id: 'tasks', label: t('nav.tasks'), icon: <TasksIcon />, path: '/tasks' },
    { id: 'settings', label: t('nav.settings'), icon: <SettingsIcon />, path: '/settings' },
    { id: 'monitor', label: t('nav.monitor'), icon: <MonitorIcon />, path: '/monitor' },
    { id: 'memory', label: t('nav.memory'), icon: <MemoryIcon />, path: '/memory' },
    { id: 'platforms', label: t('nav.platforms'), icon: <PlatformsIcon />, path: '/platforms' },
    { id: 'gateway', label: 'Gateway', icon: <GatewayIcon />, path: '/gateway' },
    { id: 'files', label: t('nav.files'), icon: <FilesIcon />, path: '/files' },
  ];

  const bottomNavItems: NavItem[] = [
    { id: 'preferences', label: t('nav.preferences'), icon: <PreferencesIcon />, path: '/preferences' },
  ];

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-overlay ${mobileSidebarOpen ? 'active' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className={`sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        {/* Header */}
        <div className="sidebar-header">
        <div className="sidebar-logo">
          {!sidebarCollapsed && (
            <span className="logo-text">
              Hermes <span className="logo-brand">Crown</span>
            </span>
          )}
        </div>
        <button className="sidebar-toggle" onClick={toggleSidebar}>
          {sidebarCollapsed ? '»' : '«'}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="sidebar-new-chat">
        <button
          className="new-chat-btn"
          onClick={() => openChat()}
          title={t('nav.newChat')}
          aria-label={t('nav.newChat')}
        >
          <span className="new-chat-icon"><PlusIcon /></span>
          {!sidebarCollapsed && <span className="new-chat-label">{t('nav.newChat')}</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav" role="navigation" aria-label={t('nav.home') === 'Home' ? 'Main navigation' : '主导航'}>
        <ul className="nav-list" role="list">
          {navItems.map((item) => (
            <li key={item.id} className="nav-item">
              <button
                className={`nav-link ${activeItem === item.id ? 'nav-link-active' : ''}`}
                onClick={() => {
                  logger.debug('[Sidebar] Clicking nav item:', item.id);
                  setActiveItem(item.id);
                }}
                aria-current={activeItem === item.id ? 'page' : undefined}
                aria-label={item.label}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="nav-label">{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom Navigation */}
      <nav className="sidebar-nav-bottom" role="navigation" aria-label={t('nav.home') === 'Home' ? 'Settings navigation' : '设置导航'}>
        <ul className="nav-list" role="list">
          {bottomNavItems.map((item) => (
            <li key={item.id} className="nav-item">
              <button
                className={`nav-link ${activeItem === item.id ? 'nav-link-active' : ''}`}
                onClick={() => {
                  logger.debug('[Sidebar] Clicking nav item:', item.id);
                  setActiveItem(item.id);
                }}
                aria-current={activeItem === item.id ? 'page' : undefined}
                aria-label={item.label}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                {!sidebarCollapsed && (
                  <>
                    <span className="nav-label">{item.label}</span>
                    {item.badge && <span className="nav-badge">{item.badge}</span>}
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
    </>
  );
};
