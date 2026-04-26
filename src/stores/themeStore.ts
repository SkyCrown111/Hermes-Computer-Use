import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Language = 'zh' | 'en';

interface ThemeState {
  mode: 'dark' | 'light';
  language: Language;
  accentColor: string;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  toggleTheme: () => void;
  setTheme: (mode: 'dark' | 'light') => void;
  setLanguage: (lang: Language) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark', // Default to dark theme (matches ErrorBoundary fallback styling)
      language: 'en', // Default to English
      accentColor: '#8F482F',
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
      toggleTheme: () => set((state) => ({ mode: state.mode === 'dark' ? 'light' : 'dark' })),
      setTheme: (mode) => set({ mode }),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'hermes-theme',
    }
  )
);

export type { Language };
