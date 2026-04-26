// Global keyboard shortcuts hook
// Ctrl+N: New chat  |  Ctrl+W: Close tab  |  Ctrl+Tab/Shift: Switch tab
import { useEffect } from 'react';
import { useNavigationStore } from '../stores';
import { useTranslation } from './useTranslation';

/**
 * Custom event name for triggering session sidebar search focus.
 * The SessionSidebar component listens for this event.
 */
export const FOCUS_SEARCH_EVENT = 'hermes:focus-search';

export function useKeyboardShortcuts() {
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA';

      // Ctrl+N: New chat
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        const newId = `new_${Date.now()}`;
        useNavigationStore.getState().openTab(newId, t('shortcuts.newChat'), 'new');
        return;
      }

      // Ctrl+W: Close current tab
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        const { activeTabId } = useNavigationStore.getState();
        if (activeTabId) {
          useNavigationStore.getState().closeTab(activeTabId);
        }
        return;
      }

      // Skip remaining shortcuts when an input is focused
      if (isInputFocused) return;

      // Ctrl+Tab / Ctrl+Shift+Tab: Cycle tabs
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const { openTabs, activeTabId } = useNavigationStore.getState();
        if (openTabs.length === 0) return;

        const currentIdx = openTabs.findIndex(t => t.id === activeTabId);
        let nextIdx: number;
        if (e.shiftKey) {
          nextIdx = currentIdx <= 0 ? openTabs.length - 1 : currentIdx - 1;
        } else {
          nextIdx = currentIdx >= openTabs.length - 1 ? 0 : currentIdx + 1;
        }
        const nextTab = openTabs[nextIdx];
        if (nextTab) {
          useNavigationStore.getState().switchTab(nextTab.id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
