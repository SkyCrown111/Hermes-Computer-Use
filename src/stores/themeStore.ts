import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Language = 'zh' | 'en';
type ThemeMode = 'dark' | 'light' | 'system';

// Display preferences that persist across sessions
interface DisplayPreferences {
  compactMode: boolean;
  sidebarPosition: 'left' | 'right';
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
  };
}

interface ThemeState {
  mode: ThemeMode;
  language: Language;
  accentColor: string;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  displayPreferences: DisplayPreferences;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  setLanguage: (lang: Language) => void;
  // Display preferences actions
  setCompactMode: (compact: boolean) => void;
  setSidebarPosition: (position: 'left' | 'right') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setNotificationSound: (sound: boolean) => void;
  setNotificationDesktop: (desktop: boolean) => void;
  updateDisplayPreferences: (prefs: Partial<DisplayPreferences>) => void;
}

// Helper to get system theme preference
const getSystemTheme = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'dark';
};

// Helper to resolve effective theme
const resolveTheme = (mode: ThemeMode): 'dark' | 'light' => {
  if (mode === 'system') {
    return getSystemTheme();
  }
  return mode;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark', // Default to dark theme (matches ErrorBoundary fallback styling)
      language: 'en', // Default to English
      accentColor: '#8F482F',
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      displayPreferences: {
        compactMode: false,
        sidebarPosition: 'left',
        notifications: {
          enabled: true,
          sound: true,
          desktop: false,
        },
      },
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      toggleTheme: () => set((state) => ({ mode: state.mode === 'dark' ? 'light' : 'dark' })),
      setTheme: (mode) => set({ mode }),
      setLanguage: (language) => set({ language }),
      // Display preferences actions
      setCompactMode: (compactMode) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, compactMode },
        })),
      setSidebarPosition: (sidebarPosition) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, sidebarPosition },
        })),
      setNotificationsEnabled: (enabled) =>
        set((state) => ({
          displayPreferences: {
            ...state.displayPreferences,
            notifications: { ...state.displayPreferences.notifications, enabled },
          },
        })),
      setNotificationSound: (sound) =>
        set((state) => ({
          displayPreferences: {
            ...state.displayPreferences,
            notifications: { ...state.displayPreferences.notifications, sound },
          },
        })),
      setNotificationDesktop: (desktop) =>
        set((state) => ({
          displayPreferences: {
            ...state.displayPreferences,
            notifications: { ...state.displayPreferences.notifications, desktop },
          },
        })),
      updateDisplayPreferences: (prefs) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, ...prefs },
        })),
    }),
    {
      name: 'hermes-theme',
    }
  )
);

// Export helper functions for external use
export { resolveTheme, getSystemTheme };

export type { Language, ThemeMode, DisplayPreferences };
