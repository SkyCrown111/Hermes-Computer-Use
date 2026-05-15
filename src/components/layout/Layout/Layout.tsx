import React from 'react';
import { exit } from '@tauri-apps/plugin-process';
import { BaseComponentProps } from '../../../types';
import { SessionSidebar } from '../SessionSidebar';
import { KeyboardShortcutsHelp } from '../../ui/KeyboardShortcutsHelp';
import { BookIcon, MonitorThemeIcon, MoonIcon, SunIcon } from '../../ui/Icons';
import { useThemeStore, useNavigationStore } from '../../../stores';
import { useTranslation } from '../../../hooks/useTranslation';
import { isTauri } from '../../../lib/tauri';
import './Layout.css';

function MinimizeWindowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeWindowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="3.25" y="3.25" width="7.5" height="7.5" rx="1.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function RestoreWindowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5.25 3.25h4a1.5 1.5 0 0 1 1.5 1.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3.25" y="5.25" width="5.5" height="5.5" rx="1.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CloseWindowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

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
  const sidebarPosition = useThemeStore((s) => s.displayPreferences.sidebarPosition);
  const mode = useThemeStore((s) => s.mode);
  const setTheme = useThemeStore((s) => s.setTheme);
  const activeItem = useNavigationStore((s) => s.activeItem);
  const setActiveItem = useNavigationStore((s) => s.setActiveItem);
  const { t, lang } = useTranslation();
  const [isWindowFocused, setIsWindowFocused] = React.useState(true);
  const [isWindowMaximized, setIsWindowMaximized] = React.useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = React.useState(false);
  const helpMenuRef = React.useRef<HTMLDivElement>(null);

  const showCustomTitlebar = isTauri();

  React.useEffect(() => {
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  React.useEffect(() => {
    if (!showCustomTitlebar) return;

    let mounted = true;
    let cleanupResize: (() => void) | undefined;
    let cleanupFocus: (() => void) | undefined;

    const bindWindowState = async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      const syncState = async () => {
        try {
          const [maximized, focused] = await Promise.all([
            appWindow.isMaximized(),
            appWindow.isFocused(),
          ]);

          if (!mounted) return;
          setIsWindowMaximized(maximized);
          setIsWindowFocused(focused);
        } catch {
          // ignore transient desktop window state errors
        }
      };

      await syncState();

      cleanupResize = await appWindow.onResized(() => {
        void syncState();
      });

      cleanupFocus = await appWindow.onFocusChanged(({ payload }) => {
        if (!mounted) return;
        setIsWindowFocused(payload);
      });
    };

    void bindWindowState();

    return () => {
      mounted = false;
      cleanupResize?.();
      cleanupFocus?.();
    };
  }, [showCustomTitlebar]);

  React.useEffect(() => {
    if (!helpMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [helpMenuOpen]);

  const layoutClasses = [
    'layout',
    sidebarCollapsed ? 'sidebar-collapsed' : '',
    showCustomTitlebar ? 'layout-has-custom-titlebar' : '',
    showCustomTitlebar && !isWindowFocused ? 'layout-window-blurred' : '',
  ].filter(Boolean).join(' ');

  const sidebarContent = <SessionSidebar />;

  const handleMinimize = React.useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().minimize();
  }, []);

  const handleToggleMaximize = React.useCallback(async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setIsWindowMaximized(await appWindow.isMaximized());
  }, []);

  const handleClose = React.useCallback(async () => {
    if (showCustomTitlebar) {
      await exit(0);
      return;
    }
    window.close();
  }, [showCustomTitlebar]);

  const swallowTitlebarPointer = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  /** Start native window drag (fallback when CSS drag-region is insufficient). */
  const handleTitlebarDragMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest('.app-titlebar-tools, .app-titlebar-help-menu, .app-titlebar-window-actions, button, a, input')) {
        return;
      }
      void (async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().startDragging();
        } catch {
          // ignore when not in Tauri or drag already handled by data-tauri-drag-region
        }
      })();
    },
    [],
  );

  const handleTitlebarDoubleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.closest('.app-titlebar-tools, .app-titlebar-help-menu, .app-titlebar-window-actions, button, a, input')) {
        return;
      }
      void handleMinimize();
    },
    [handleMinimize],
  );

  const handleThemeCycle = React.useCallback(() => {
    const nextMode = mode === 'dark' ? 'light' : mode === 'light' ? 'system' : 'dark';
    setTheme(nextMode);
  }, [mode, setTheme]);

  const ThemeIcon = mode === 'dark' ? MoonIcon : mode === 'light' ? SunIcon : MonitorThemeIcon;
  const helpDescription = lang === 'zh'
    ? '查看项目整体功能说明与使用指引'
    : 'Open the project overview and usage guide';
  const prefsDescription = lang === 'zh'
    ? '前往主题、布局和通知偏好设置'
    : 'Open theme, layout, and notification preferences';

  const titlebar = showCustomTitlebar ? (
    <div
      className="app-titlebar"
      data-tauri-drag-region
      onMouseDown={handleTitlebarDragMouseDown}
      onDoubleClick={handleTitlebarDoubleClick}
    >
      <div className="app-titlebar-left">
        <div className="app-titlebar-brand">
          <span className="app-titlebar-mark" aria-hidden="true">H</span>
          <span className="app-titlebar-name">Hermes</span>
        </div>
        <div className="app-titlebar-tools" ref={helpMenuRef}>
          <button
            type="button"
            className="app-titlebar-tool-btn"
            onMouseDown={swallowTitlebarPointer}
            onDoubleClick={swallowTitlebarPointer}
            onClick={handleThemeCycle}
            title={`${t('prefs.theme') || 'Theme'}: ${mode}`}
            aria-label={t('prefs.theme') || 'Theme'}
          >
            <ThemeIcon size={15} />
          </button>
          <button
            type="button"
            className={`app-titlebar-tool-btn ${helpMenuOpen ? 'active' : ''}`}
            onMouseDown={swallowTitlebarPointer}
            onDoubleClick={swallowTitlebarPointer}
            onClick={() => setHelpMenuOpen((open) => !open)}
            title={t('nav.help') || 'Help'}
            aria-label={t('nav.help') || 'Help'}
          >
            <BookIcon size={15} />
          </button>
        {helpMenuOpen && (
          <div className="app-titlebar-help-menu" onMouseDown={swallowTitlebarPointer}>
              <button
                type="button"
                className="app-titlebar-help-item"
                onMouseDown={swallowTitlebarPointer}
                onDoubleClick={swallowTitlebarPointer}
                onClick={() => {
                  setActiveItem('help');
                  setHelpMenuOpen(false);
                }}
              >
                <span className="app-titlebar-help-item-title">{t('nav.help') || 'Help'}</span>
                <span className="app-titlebar-help-item-copy">{helpDescription}</span>
              </button>
              <button
                type="button"
                className="app-titlebar-help-item"
                onMouseDown={swallowTitlebarPointer}
                onDoubleClick={swallowTitlebarPointer}
                onClick={() => {
                  setActiveItem('preferences');
                  setHelpMenuOpen(false);
                }}
              >
                <span className="app-titlebar-help-item-title">{t('nav.preferences')}</span>
                <span className="app-titlebar-help-item-copy">{prefsDescription}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="app-titlebar-center" />

      <div className="app-titlebar-window-actions">
        <button
          type="button"
          className="app-titlebar-btn"
          onMouseDown={swallowTitlebarPointer}
          onDoubleClick={swallowTitlebarPointer}
          onClick={() => { void handleMinimize(); }}
          aria-label="Minimize window"
          title="Minimize"
        >
          <MinimizeWindowIcon />
        </button>
        <button
          type="button"
          className="app-titlebar-btn"
          onMouseDown={swallowTitlebarPointer}
          onDoubleClick={swallowTitlebarPointer}
          onClick={() => { void handleToggleMaximize(); }}
          aria-label={isWindowMaximized ? 'Restore window' : 'Maximize window'}
          title={isWindowMaximized ? 'Restore' : 'Maximize'}
        >
          {isWindowMaximized ? <RestoreWindowIcon /> : <MaximizeWindowIcon />}
        </button>
        <button
          type="button"
          className="app-titlebar-btn app-titlebar-btn-close"
          onMouseDown={swallowTitlebarPointer}
          onDoubleClick={swallowTitlebarPointer}
          onClick={() => { void handleClose(); }}
          aria-label="Close window"
          title="Close"
        >
          <CloseWindowIcon />
        </button>
      </div>
    </div>
  ) : null;

  const mainContent = (
    <main className="layout-main">
      <div className="mobile-header">
        <button className="hamburger-btn" onClick={toggleMobileSidebar} aria-label="Open menu">
          <MenuIcon />
        </button>
        <span className="mobile-header-title">{title || t('nav.home')}</span>
        {actions && <div className="mobile-actions">{actions}</div>}
      </div>

      {(title || actions) && (
        <header className="layout-header">
          {title && <h1 className="layout-title">{title}</h1>}
          {actions && <div className="layout-actions">{actions}</div>}
        </header>
      )}
      <div className={`layout-content ${activeItem === 'chat' ? 'layout-content-chat' : ''} ${className}`}>{children}</div>
    </main>
  );

  return (
    <div className={layoutClasses} data-sidebar-position={sidebarPosition}>
      {titlebar}
      <div className="layout-body">
        {sidebarPosition === 'right' ? (
          <>{mainContent}{sidebarContent}</>
        ) : (
          <>{sidebarContent}{mainContent}</>
        )}
      </div>
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
