// Theme Store Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { useThemeStore, resolveTheme, getSystemTheme } from '../themeStore';

describe('ThemeStore', () => {
  beforeEach(() => {
    // Pre-set localStorage for zustand persist to avoid async rehydration
    localStorage.setItem('hermes-theme', JSON.stringify({
      state: {
        mode: 'dark',
        language: 'en',
        accentColor: '#8F482F',
        sidebarCollapsed: false,
        mobileSidebarOpen: false,
        displayPreferences: {
          compactMode: false,
          sidebarPosition: 'left',
          showStreaming: false,
          showReasoning: false,
          showToolPreview: false,
          toolProgress: 'minimal',
          markdownMode: 'render',
          showInlineDiffs: false,
          showCost: false,
          resumeDisplay: 'summary',
          notifications: {
            enabled: true,
            sound: true,
            desktop: false,
          },
        },
      },
    }));

    // Reset store to known state
    useThemeStore.setState({
      mode: 'dark',
      language: 'en',
      accentColor: '#8F482F',
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      displayPreferences: {
        compactMode: false,
        sidebarPosition: 'left',
        showStreaming: false,
        showReasoning: false,
        showToolPreview: false,
        toolProgress: 'minimal',
        markdownMode: 'render',
        showInlineDiffs: false,
        showCost: false,
        resumeDisplay: 'summary',
        notifications: {
          enabled: true,
          sound: true,
          desktop: false,
        },
      },
    });
  });

  describe('toggleTheme', () => {
    it('should toggle from dark to light', () => {
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should toggle from light to dark', () => {
      useThemeStore.getState().setTheme('light');
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().mode).toBe('dark');
    });
  });

  describe('setTheme', () => {
    it('should set theme to dark', () => {
      useThemeStore.getState().setTheme('dark');
      expect(useThemeStore.getState().mode).toBe('dark');
    });

    it('should set theme to light', () => {
      useThemeStore.getState().setTheme('light');
      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should set theme to system', () => {
      useThemeStore.getState().setTheme('system');
      expect(useThemeStore.getState().mode).toBe('system');
    });
  });

  describe('setLanguage', () => {
    it('should set language to zh', () => {
      useThemeStore.getState().setLanguage('zh');
      expect(useThemeStore.getState().language).toBe('zh');
    });

    it('should set language to en', () => {
      useThemeStore.getState().setLanguage('zh');
      useThemeStore.getState().setLanguage('en');
      expect(useThemeStore.getState().language).toBe('en');
    });
  });

  describe('toggleSidebar', () => {
    it('should toggle sidebar collapsed state', () => {
      expect(useThemeStore.getState().sidebarCollapsed).toBe(false);
      useThemeStore.getState().toggleSidebar();
      expect(useThemeStore.getState().sidebarCollapsed).toBe(true);
      useThemeStore.getState().toggleSidebar();
      expect(useThemeStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('setSidebarCollapsed', () => {
    it('should set sidebar collapsed to true', () => {
      useThemeStore.getState().setSidebarCollapsed(true);
      expect(useThemeStore.getState().sidebarCollapsed).toBe(true);
    });

    it('should set sidebar collapsed to false', () => {
      useThemeStore.getState().setSidebarCollapsed(true);
      useThemeStore.getState().setSidebarCollapsed(false);
      expect(useThemeStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('mobile sidebar', () => {
    it('should set mobile sidebar open', () => {
      useThemeStore.getState().setMobileSidebarOpen(true);
      expect(useThemeStore.getState().mobileSidebarOpen).toBe(true);
    });

    it('should toggle mobile sidebar', () => {
      expect(useThemeStore.getState().mobileSidebarOpen).toBe(false);
      useThemeStore.getState().toggleMobileSidebar();
      expect(useThemeStore.getState().mobileSidebarOpen).toBe(true);
    });
  });

  describe('displayPreferences', () => {
    it('should set compact mode', () => {
      useThemeStore.getState().setCompactMode(true);
      expect(useThemeStore.getState().displayPreferences.compactMode).toBe(true);
    });

    it('should set sidebar position', () => {
      useThemeStore.getState().setSidebarPosition('right');
      expect(useThemeStore.getState().displayPreferences.sidebarPosition).toBe('right');
    });

    it('should set notifications enabled', () => {
      useThemeStore.getState().setNotificationsEnabled(false);
      expect(useThemeStore.getState().displayPreferences.notifications.enabled).toBe(false);
    });

    it('should set notification sound', () => {
      useThemeStore.getState().setNotificationSound(false);
      expect(useThemeStore.getState().displayPreferences.notifications.sound).toBe(false);
    });

    it('should set notification desktop', () => {
      useThemeStore.getState().setNotificationDesktop(true);
      expect(useThemeStore.getState().displayPreferences.notifications.desktop).toBe(true);
    });

    it('should update display preferences', () => {
      useThemeStore.getState().updateDisplayPreferences({
        compactMode: true,
        sidebarPosition: 'right',
      });
      expect(useThemeStore.getState().displayPreferences.compactMode).toBe(true);
      expect(useThemeStore.getState().displayPreferences.sidebarPosition).toBe('right');
    });
  });

  describe('persistence', () => {
    it('should persist state to localStorage', () => {
      useThemeStore.getState().setTheme('light');
      useThemeStore.getState().setLanguage('zh');

      // Check localStorage was updated
      const stored = localStorage.getItem('hermes-theme');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.mode).toBe('light');
      expect(parsed.state.language).toBe('zh');
    });
  });
});

describe('resolveTheme', () => {
  it('should return dark when mode is dark', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('should return light when mode is light', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  it('should return a valid theme when mode is system', () => {
    const result = resolveTheme('system');
    expect(['dark', 'light']).toContain(result);
  });
});

describe('getSystemTheme', () => {
  it('should return a valid theme', () => {
    const result = getSystemTheme();
    expect(['dark', 'light']).toContain(result);
  });
});
