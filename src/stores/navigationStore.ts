import { create } from 'zustand';
import { logger } from '../lib/logger';

const TAB_STORAGE_KEY = 'hermes-open-tabs';

interface ChatContext {
  sessionId?: string;
  sessionTitle?: string;
}

interface OpenTab {
  id: string;
  title: string;
  type: 'session' | 'new';
}

interface TabPersistence {
  openTabs: Array<{ id: string; title: string; type: 'session' | 'new' }>;
  activeTabId: string | null;
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
  replaceTabId: (oldId: string, newId: string, newTitle?: string) => void;
  saveTabs: () => void;
  restoreTabs: () => Promise<void>;
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
      get().saveTabs();
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
    get().saveTabs();
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
        get().saveTabs();
        return;
      }
    } else {
      set({ openTabs: newTabs });
    }
    get().saveTabs();
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
      get().saveTabs();
      logger.debug('[NavigationStore] Switched to tab:', id);
    }
  },
  updateTabTitle: (id: string, title: string) => {
    const { openTabs } = get();
    const newTabs = openTabs.map(tab =>
      tab.id === id ? { ...tab, title } : tab
    );
    set({ openTabs: newTabs });
    get().saveTabs();
  },
  replaceTabId: (oldId: string, newId: string, newTitle?: string) => {
    const { openTabs, activeTabId } = get();
    const newTabs: OpenTab[] = openTabs.map(tab =>
      tab.id === oldId ? { ...tab, id: newId, title: newTitle || tab.title, type: 'session' as const } : tab
    );
    const newActiveTabId = activeTabId === oldId ? newId : activeTabId;
    set({
      openTabs: newTabs,
      activeTabId: newActiveTabId,
      chatContext: newActiveTabId ? { sessionId: newActiveTabId, sessionTitle: newTitle || openTabs.find(t => t.id === oldId)?.title } : null
    });
    get().saveTabs();
    logger.debug('[NavigationStore] Replaced tab ID:', oldId, '->', newId);
    // Note: Message migration is handled by the caller (ChatPage) before calling replaceTabId
  },
  // Save tabs to localStorage
  saveTabs: () => {
    const { openTabs, activeTabId } = get();
    const data: TabPersistence = {
      openTabs: openTabs.map(t => ({ id: t.id, title: t.title, type: t.type })),
      activeTabId,
    };
    try {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // noop
    }
  },
  // Restore tabs from localStorage (call on app init)
  restoreTabs: async () => {
    try {
      const raw = localStorage.getItem(TAB_STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw) as TabPersistence;
      if (!data.openTabs || data.openTabs.length === 0) return;

      // Keep all tabs including "new_" ones - they might have messages
      // The session store will try to fetch them or create them
      const validTabs: OpenTab[] = data.openTabs
        .map(t => ({
          id: t.id,
          title: t.title,
          type: t.type || 'session',
        }));

      if (validTabs.length === 0) return;

      const activeId = data.activeTabId && validTabs.some(t => t.id === data.activeTabId)
        ? data.activeTabId
        : validTabs[0]!.id;

      const activeTab = validTabs.find(t => t.id === activeId);
      set({
        openTabs: validTabs,
        activeTabId: activeId,
        activeItem: 'chat',
        chatContext: activeTab ? { sessionId: activeTab.id, sessionTitle: activeTab.title } : null,
      });

      logger.debug('[NavigationStore] Restored tabs:', validTabs.length, 'active:', activeId);
      logger.debug('[NavigationStore] Tab IDs:', validTabs.map(t => t.id));
    } catch (err) {
      logger.error('[NavigationStore] Error restoring tabs:', err);
    }
  },
}));
