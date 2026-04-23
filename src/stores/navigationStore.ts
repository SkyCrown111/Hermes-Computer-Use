import { create } from 'zustand';
import { logger } from '../lib/logger';

interface ChatContext {
  sessionId?: string;
  sessionTitle?: string;
}

interface OpenTab {
  id: string;
  title: string;
  type: 'session' | 'new';
}

interface NavigationState {
  activeItem: string;
  chatContext: ChatContext | null;
  openTabs: OpenTab[];
  activeTabId: string | null;
  setActiveItem: (id: string) => void;
  openChat: (sessionId?: string, sessionTitle?: string) => void;
  closeChat: () => void;
  openTab: (id: string, title: string, type?: 'session' | 'new') => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  updateTabTitle: (id: string, title: string) => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  activeItem: 'dashboard',
  chatContext: null,
  openTabs: [],
  activeTabId: null,
  setActiveItem: (id) => {
    logger.debug('[NavigationStore] Setting active item to:', id);
    set({ activeItem: id });
  },
  openChat: (sessionId?: string, sessionTitle?: string) => {
    logger.debug('[NavigationStore] Opening chat with session:', sessionId, sessionTitle);
    set({ activeItem: 'chat', chatContext: sessionId ? { sessionId, sessionTitle } : null });
  },
  closeChat: () => {
    logger.debug('[NavigationStore] Closing chat');
    set({ activeItem: 'sessions', chatContext: null });
  },
  openTab: (id: string, title: string, type: 'session' | 'new' = 'session') => {
    const { openTabs } = get();

    // Check if tab already exists
    const existingTab = openTabs.find(tab => tab.id === id);
    if (existingTab) {
      // Just switch to it
      set({ activeTabId: id, activeItem: 'chat', chatContext: { sessionId: id, sessionTitle: title } });
      return;
    }

    // Add new tab
    const newTab: OpenTab = { id, title: title || `新会话`, type };
    const newTabs = [...openTabs, newTab];
    set({
      openTabs: newTabs,
      activeTabId: id,
      activeItem: 'chat',
      chatContext: { sessionId: id, sessionTitle: title }
    });
    logger.debug('[NavigationStore] Opened tab:', id, title);
  },
  closeTab: (id: string) => {
    const { openTabs, activeTabId } = get();
    const newTabs = openTabs.filter(tab => tab.id !== id);

    // If closing active tab, switch to another
    let newActiveTabId = activeTabId;
    if (activeTabId === id) {
      if (newTabs.length > 0) {
        // Switch to the last tab
        newActiveTabId = newTabs[newTabs.length - 1].id;
        const activeTab = newTabs[newTabs.length - 1];
        set({
          openTabs: newTabs,
          activeTabId: newActiveTabId,
          chatContext: { sessionId: activeTab.id, sessionTitle: activeTab.title }
        });
      } else {
        // No tabs left, go to sessions
        set({
          openTabs: [],
          activeTabId: null,
          activeItem: 'sessions',
          chatContext: null
        });
        return;
      }
    } else {
      set({ openTabs: newTabs });
    }
    logger.debug('[NavigationStore] Closed tab:', id);
  },
  switchTab: (id: string) => {
    const { openTabs } = get();
    const tab = openTabs.find(t => t.id === id);
    if (tab) {
      set({
        activeTabId: id,
        chatContext: { sessionId: tab.id, sessionTitle: tab.title }
      });
      logger.debug('[NavigationStore] Switched to tab:', id);
    }
  },
  updateTabTitle: (id: string, title: string) => {
    const { openTabs } = get();
    const newTabs = openTabs.map(tab =>
      tab.id === id ? { ...tab, title } : tab
    );
    set({ openTabs: newTabs });
  },
}));
