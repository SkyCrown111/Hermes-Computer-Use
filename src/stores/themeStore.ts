import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Language = 'zh' | 'en';
type ThemeMode = 'dark' | 'light' | 'system';

// Full display preferences that persist across sessions
interface DisplayPreferences {
  // Basic UI
  compactMode: boolean;
  sidebarPosition: 'left' | 'right';
  // Chat display
  showStreaming: boolean;
  showReasoning: boolean;
  showToolPreview: boolean;
  toolProgress: 'all' | 'minimal' | 'none';
  markdownMode: 'render' | 'strip' | 'raw';
  showInlineDiffs: boolean;
  showCost: boolean;
  resumeDisplay: 'full' | 'summary' | 'none';
  // Notifications
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
  setShowStreaming: (show: boolean) => void;
  setShowReasoning: (show: boolean) => void;
  setShowToolPreview: (show: boolean) => void;
  setToolProgress: (mode: DisplayPreferences['toolProgress']) => void;
  setMarkdownMode: (mode: DisplayPreferences['markdownMode']) => void;
  setShowInlineDiffs: (show: boolean) => void;
  setShowCost: (show: boolean) => void;
  setResumeDisplay: (mode: DisplayPreferences['resumeDisplay']) => void;
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
  if (mode === 'system') return getSystemTheme();
  return mode;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      language: 'zh',
      accentColor: '#8F482F',
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      displayPreferences: {
        compactMode: false,
        sidebarPosition: 'left',
        showStreaming: true,
        showReasoning: false,
        showToolPreview: true,
        toolProgress: 'minimal',
        markdownMode: 'render',
        showInlineDiffs: true,
        showCost: true,
        resumeDisplay: 'full',
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
      setShowStreaming: (showStreaming) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, showStreaming },
        })),
      setShowReasoning: (showReasoning) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, showReasoning },
        })),
      setShowToolPreview: (showToolPreview) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, showToolPreview },
        })),
      setToolProgress: (toolProgress) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, toolProgress },
        })),
      setMarkdownMode: (markdownMode) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, markdownMode },
        })),
      setShowInlineDiffs: (showInlineDiffs) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, showInlineDiffs },
        })),
      setShowCost: (showCost) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, showCost },
        })),
      setResumeDisplay: (resumeDisplay) =>
        set((state) => ({
          displayPreferences: { ...state.displayPreferences, resumeDisplay },
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

export { resolveTheme, getSystemTheme };
export type { Language, ThemeMode, DisplayPreferences };
