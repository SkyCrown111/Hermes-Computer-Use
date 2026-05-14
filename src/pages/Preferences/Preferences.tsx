import React, { useState, useEffect, useCallback } from 'react';
import { Card, SkeletonText } from '../../components';
import {
  SettingsIcon,
  GlobeIcon,
  CrownIcon,
  SunIcon,
  MoonIcon,
  MonitorThemeIcon,
  LayoutIcon,
  BellIcon,
  BellOffIcon,
  VolumeIcon,
  VolumeOffIcon,
  KeyboardIcon,
  InfoIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  XIcon,
  HomeIcon,
  ChatIcon,
  ClockIcon,
  FolderIcon,
  GridIcon,
  TargetIcon,
  ServerIcon,
  PlugIcon,
} from '../../components/ui/Icons';
import { useNavigationStore, useThemeStore } from '../../stores';
import { useTranslation } from '../../hooks/useTranslation';
import { getCurrentVersion } from '../../services/updateApi';
import './Preferences.css';

const aboutInfo = {
  author: 'Crown_22',
  email: 'akangx@foxmail.com',
  github: 'https://github.com/SkyCrown111',
  credits: [
    { name: 'Tauri', url: 'https://tauri.app', desc: 'Desktop application framework' },
    { name: 'React', url: 'https://react.dev', desc: 'UI library' },
    { name: 'Zustand', url: 'https://zustand-demo.pmnd.rs', desc: 'State management' },
    { name: 'Lucide Icons', url: 'https://lucide.dev', desc: 'Icon library' },
  ],
};

// Keyboard shortcuts data
const getShortcutGroups = (t: (key: string) => string) => [
  {
    title: t('shortcuts.global') || 'Global',
    shortcuts: [
      { keys: ['Ctrl', 'N'], description: t('shortcuts.newChat') || 'New chat' },
      { keys: ['Ctrl', 'W'], description: t('shortcuts.closeTab') || 'Close tab' },
      { keys: ['Ctrl', 'Tab'], description: t('shortcuts.nextTab') || 'Next tab' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: t('shortcuts.prevTab') || 'Previous tab' },
      { keys: ['Ctrl', 'K'], description: t('shortcuts.commandPalette') || 'Command palette' },
      { keys: ['Ctrl', 'Shift', 'F'], description: t('shortcuts.globalSearch') || 'Global search' },
      { keys: ['Ctrl', '/'], description: t('shortcuts.showHelp') || 'Show keyboard shortcuts' },
    ],
  },
  {
    title: t('shortcuts.chat') || 'Chat',
    shortcuts: [
      { keys: ['Ctrl', 'F'], description: t('shortcuts.searchMessages') || 'Search messages' },
      { keys: ['Enter'], description: t('shortcuts.sendMessage') || 'Send message' },
      { keys: ['Shift', 'Enter'], description: t('shortcuts.newLine') || 'New line' },
      { keys: ['Esc'], description: t('shortcuts.close') || 'Close / Cancel' },
    ],
  },
  {
    title: t('shortcuts.slashCommands') || 'Slash Commands',
    shortcuts: [
      { keys: ['/'], description: t('shortcuts.startCommand') || 'Start slash command' },
      { keys: ['Up', 'Down'], description: t('shortcuts.navigateCommands') || 'Navigate commands' },
      { keys: ['Tab'], description: t('shortcuts.selectCommand') || 'Select command' },
    ],
  },
];

export const Preferences: React.FC = () => {
  const mode = useThemeStore(s => s.mode);
  const language = useThemeStore(s => s.language);
  const setLanguage = useThemeStore(s => s.setLanguage);
  const setTheme = useThemeStore(s => s.setTheme);
  const displayPreferences = useThemeStore(s => s.displayPreferences);
  const setCompactMode = useThemeStore(s => s.setCompactMode);
  const setSidebarPosition = useThemeStore(s => s.setSidebarPosition);
  const setNotificationsEnabled = useThemeStore(s => s.setNotificationsEnabled);
  const setNotificationSound = useThemeStore(s => s.setNotificationSound);
  const setNotificationDesktop = useThemeStore(s => s.setNotificationDesktop);
  const setActiveItem = useNavigationStore(s => s.setActiveItem);
  const { t } = useTranslation();
  const [version, setVersion] = useState('0.1.0');
  const [showShortcuts, setShowShortcuts] = useState(false);

  const utilityPages = [
    { id: 'dashboard', label: t('nav.home'), icon: HomeIcon },
    { id: 'sessions', label: t('nav.sessions'), icon: ChatIcon },
    { id: 'tasks', label: t('nav.tasks'), icon: ClockIcon },
    { id: 'kanban', label: t('nav.kanban'), icon: GridIcon },
    { id: 'files', label: t('nav.files'), icon: FolderIcon },
    { id: 'skills', label: t('nav.skills'), icon: TargetIcon },
    { id: 'gateway', label: 'Gateway', icon: ServerIcon },
    { id: 'mcp', label: t('nav.mcp'), icon: PlugIcon },
    { id: 'settings', label: t('nav.settings'), icon: SettingsIcon },
    { id: 'help', label: t('nav.help') || 'Help', icon: InfoIcon },
  ] as const;

  useEffect(() => {
    getCurrentVersion().then(setVersion).catch(() => setVersion('0.1.0'));
  }, []);

  // Listen for keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      setShowShortcuts(prev => !prev);
    }
    if (e.key === 'Escape' && showShortcuts) {
      setShowShortcuts(false);
    }
  }, [showShortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Theme options
  const themeOptions = [
    { value: 'light', icon: SunIcon, label: t('prefs.light') || 'Light' },
    { value: 'dark', icon: MoonIcon, label: t('prefs.dark') || 'Dark' },
    { value: 'system', icon: MonitorThemeIcon, label: t('prefs.system') || 'System' },
  ] as const;

  return (
    <div className="preferences-page">
      <div className="preferences-header">
        <h1>{t('prefs.title')}</h1>
        <p>{t('prefs.subtitle')}</p>
      </div>

      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon"><SettingsIcon size={18} /></span>
            <div>
              <h2>More Pages</h2>
              <p>Low-frequency tools and utility pages live here instead of the chat sidebar.</p>
            </div>
          </div>

          <div className="preferences-link-grid">
            {utilityPages.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className="preferences-link-tile"
                onClick={() => setActiveItem(id)}
              >
                <span className="preferences-link-icon"><Icon size={16} /></span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Appearance Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon"><SettingsIcon size={18} /></span>
            <div>
              <h2>{t('prefs.appearance')}</h2>
              <p>{t('prefs.appearanceDesc')}</p>
            </div>
          </div>

          {/* Theme Selection */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.theme')}</span>
              <span className="preference-description">{t('prefs.themeDesc')}</span>
            </div>
            <div className="theme-toggle">
              {themeOptions.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  className={`theme-btn ${mode === value ? 'active' : ''}`}
                  onClick={() => setTheme(value)}
                  title={label}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language Selection */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.language')}</span>
              <span className="preference-description">{t('prefs.languageDesc')}</span>
            </div>
            <div className="language-toggle">
              <button
                className={`lang-btn ${language === 'zh' ? 'active' : ''}`}
                onClick={() => setLanguage('zh')}
              >
                中文
              </button>
              <button
                className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => setLanguage('en')}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Display Preferences Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon"><LayoutIcon size={18} /></span>
            <div>
              <h2>{t('prefs.display')}</h2>
              <p>{t('prefs.displayDesc')}</p>
            </div>
          </div>

          {/* Compact Mode */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.compactMode')}</span>
              <span className="preference-description">{t('prefs.compactModeDesc')}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={displayPreferences.compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {/* Sidebar Position */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.sidebarPosition')}</span>
              <span className="preference-description">{t('prefs.sidebarPositionDesc')}</span>
            </div>
            <div className="position-toggle">
              <button
                className={`position-btn ${displayPreferences.sidebarPosition === 'left' ? 'active' : ''}`}
                onClick={() => setSidebarPosition('left')}
                title={t('prefs.sidebarLeft') || 'Left'}
              >
                <SidebarLeftIcon size={16} />
              </button>
              <button
                className={`position-btn ${displayPreferences.sidebarPosition === 'right' ? 'active' : ''}`}
                onClick={() => setSidebarPosition('right')}
                title={t('prefs.sidebarRight') || 'Right'}
              >
                <SidebarRightIcon size={16} />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Notification Settings Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon">
              {displayPreferences.notifications.enabled ? <BellIcon size={18} /> : <BellOffIcon size={18} />}
            </span>
            <div>
              <h2>{t('prefs.notifications')}</h2>
              <p>{t('prefs.notificationsDesc')}</p>
            </div>
          </div>

          {/* Enable Notifications */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.enableNotifications')}</span>
              <span className="preference-description">{t('prefs.enableNotificationsDesc')}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={displayPreferences.notifications.enabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {/* Sound Notifications */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">
                {displayPreferences.notifications.sound ? <VolumeIcon size={14} /> : <VolumeOffIcon size={14} />}
                {' '}{t('prefs.notificationSound')}
              </span>
              <span className="preference-description">{t('prefs.notificationSoundDesc')}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={displayPreferences.notifications.sound}
                onChange={(e) => setNotificationSound(e.target.checked)}
                disabled={!displayPreferences.notifications.enabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {/* Desktop Notifications */}
          <div className="preference-item">
            <div className="preference-info">
              <span className="preference-label">{t('prefs.desktopNotifications')}</span>
              <span className="preference-description">{t('prefs.desktopNotificationsDesc')}</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={displayPreferences.notifications.desktop}
                onChange={(e) => setNotificationDesktop(e.target.checked)}
                disabled={!displayPreferences.notifications.enabled}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      </Card>

      {/* Keyboard Shortcuts Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon"><KeyboardIcon size={18} /></span>
            <div>
              <h2>{t('shortcuts.title')}</h2>
              <p>{t('prefs.shortcutsDesc')}</p>
            </div>
          </div>

          <button
            className="view-shortcuts-btn"
            onClick={() => setShowShortcuts(true)}
          >
            <KeyboardIcon size={16} />
            <span>{t('prefs.viewShortcuts')}</span>
          </button>

          {/* Shortcuts Preview */}
          <div className="shortcuts-preview">
            {getShortcutGroups(t).slice(0, 1).map(group => (
              <div key={group.title} className="shortcuts-preview-group">
                {group.shortcuts.slice(0, 3).map((shortcut, idx) => (
                  <div key={idx} className="shortcut-preview-item">
                    <span className="shortcut-description">{shortcut.description}</span>
                    <span className="shortcut-keys">
                      {shortcut.keys.map((key, keyIdx) => (
                        <React.Fragment key={key}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {keyIdx < shortcut.keys.length - 1 && <span className="shortcut-plus">+</span>}
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* About Section */}
      <Card className="preferences-card">
        <div className="preferences-section">
          <div className="section-header">
            <span className="section-icon"><InfoIcon size={18} /></span>
            <div>
              <h2>{t('prefs.about')}</h2>
              <p>{t('prefs.aboutDesc')}</p>
            </div>
          </div>

          <div className="about-content">
            <div className="about-logo">
              <span className="logo-icon"><CrownIcon size={24} /></span>
              <div className="logo-text">
                <h3>{t('prefs.productName')}</h3>
                {version ? <span className="version">v{version}</span> : <SkeletonText lines={1} lineHeight="0.9em" />}
              </div>
            </div>

            <p className="about-description">{t('prefs.productDesc')}</p>

            <div className="about-details">
              <div className="about-item">
                <span className="about-label">{t('prefs.author')}</span>
                <span className="about-value">{aboutInfo.author}</span>
              </div>
              <div className="about-item">
                <span className="about-label">{t('prefs.email')}</span>
                <a href={`mailto:${aboutInfo.email}`} className="about-link">
                  {aboutInfo.email}
                </a>
              </div>
            </div>

            <div className="social-links">
              <a
                href={aboutInfo.github}
                target="_blank"
                rel="noopener noreferrer"
                className="social-link"
              >
                <span className="social-icon"><GlobeIcon size={14} /></span>
                <span>{t('prefs.github')}</span>
              </a>
            </div>

            {/* Credits */}
            <div className="credits-section">
              <h4>{t('prefs.credits')}</h4>
              <div className="credits-list">
                {aboutInfo.credits.map((credit, idx) => (
                  <a
                    key={idx}
                    href={credit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="credit-item"
                  >
                    <span className="credit-name">{credit.name}</span>
                    <span className="credit-desc">{credit.desc}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="shortcuts-modal-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
            <div className="shortcuts-modal-header">
              <h2>{t('shortcuts.title')}</h2>
              <button className="shortcuts-modal-close" onClick={() => setShowShortcuts(false)}>
                <XIcon size={14} />
              </button>
            </div>
            <div className="shortcuts-modal-content">
              {getShortcutGroups(t).map(group => (
                <div key={group.title} className="shortcuts-group">
                  <h3 className="shortcuts-group-title">{group.title}</h3>
                  <div className="shortcuts-list">
                    {group.shortcuts.map((shortcut, idx) => (
                      <div key={idx} className="shortcut-item">
                        <span className="shortcut-description">{shortcut.description}</span>
                        <span className="shortcut-keys">
                          {shortcut.keys.map((key, keyIdx) => (
                            <React.Fragment key={key}>
                              <kbd className="shortcut-key">{key}</kbd>
                              {keyIdx < shortcut.keys.length - 1 && (
                                <span className="shortcut-plus">+</span>
                              )}
                            </React.Fragment>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="shortcuts-modal-footer">
              <span className="shortcuts-hint">
                <kbd>Esc</kbd> {t('shortcuts.toClose')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
