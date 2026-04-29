// Navigation Store Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/sessionApi', () => ({
  getSession: vi.fn().mockImplementation(async (id: string) => ({
    session_id: id,
    messages: [],
  })),
}));

import { useNavigationStore } from '../navigationStore';

describe('NavigationStore', () => {
  beforeEach(() => {
    // Reset store state
    useNavigationStore.setState({
      activeItem: 'dashboard',
      chatContext: null,
      openTabs: [],
      activeTabId: null,
    });
    localStorage.clear();
  });

  describe('openTab', () => {
    it('should open a new tab', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');

      const state = useNavigationStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.openTabs[0].id).toBe('session-1');
      expect(state.openTabs[0].title).toBe('Chat 1');
      expect(state.activeTabId).toBe('session-1');
      expect(state.activeItem).toBe('chat');
    });

    it('should switch to existing tab instead of duplicating', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');
      useNavigationStore.getState().openTab('session-2', 'Chat 2');
      useNavigationStore.getState().openTab('session-1', 'Chat 1');

      const state = useNavigationStore.getState();
      expect(state.openTabs).toHaveLength(2);
      expect(state.activeTabId).toBe('session-1');
    });

    it('should set default title for new tabs', () => {
      useNavigationStore.getState().openTab('session-1', '');

      const state = useNavigationStore.getState();
      expect(state.openTabs[0].title).toBe('新会话');
    });
  });

  describe('closeTab', () => {
    it('should close a tab and switch to another', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');
      useNavigationStore.getState().openTab('session-2', 'Chat 2');

      useNavigationStore.getState().closeTab('session-1');

      const state = useNavigationStore.getState();
      expect(state.openTabs).toHaveLength(1);
      expect(state.openTabs[0].id).toBe('session-2');
    });

    it('should close last tab and return to sessions page', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');

      useNavigationStore.getState().closeTab('session-1');

      const state = useNavigationStore.getState();
      expect(state.openTabs).toHaveLength(0);
      expect(state.activeItem).toBe('sessions');
      expect(state.activeTabId).toBeNull();
    });
  });

  describe('switchTab', () => {
    it('should switch to the specified tab', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');
      useNavigationStore.getState().openTab('session-2', 'Chat 2');

      useNavigationStore.getState().switchTab('session-1');

      const state = useNavigationStore.getState();
      expect(state.activeTabId).toBe('session-1');
      expect(state.chatContext?.sessionId).toBe('session-1');
    });

    it('should not switch to non-existent tab', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');

      useNavigationStore.getState().switchTab('nonexistent');

      const state = useNavigationStore.getState();
      expect(state.activeTabId).toBe('session-1'); // unchanged
    });
  });

  describe('updateTabTitle', () => {
    it('should update tab title', () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');
      useNavigationStore.getState().updateTabTitle('session-1', 'Renamed Chat');

      const tab = useNavigationStore.getState().openTabs.find(t => t.id === 'session-1');
      expect(tab?.title).toBe('Renamed Chat');
    });
  });

  describe('replaceTabId', () => {
    it('should replace old tab ID with new one (session migration)', () => {
      useNavigationStore.getState().openTab('new_123', 'New Session');

      useNavigationStore.getState().replaceTabId('new_123', 'real-session-456', 'Updated');

      const state = useNavigationStore.getState();
      expect(state.openTabs.find(t => t.id === 'new_123')).toBeUndefined();
      expect(state.openTabs.find(t => t.id === 'real-session-456')).toBeDefined();
      expect(state.openTabs[0].title).toBe('Updated');
      expect(state.activeTabId).toBe('real-session-456');
    });
  });

  describe('setActiveItem', () => {
    it('should set the active navigation item', () => {
      useNavigationStore.getState().setActiveItem('settings');
      expect(useNavigationStore.getState().activeItem).toBe('settings');
    });
  });

  describe('openChat', () => {
    it('should open chat with session context', () => {
      useNavigationStore.getState().openChat('session-1', 'My Chat');

      const state = useNavigationStore.getState();
      expect(state.activeItem).toBe('chat');
      expect(state.chatContext?.sessionId).toBe('session-1');
      expect(state.chatContext?.sessionTitle).toBe('My Chat');
    });

    it('should open chat without session context', () => {
      useNavigationStore.getState().openChat();

      const state = useNavigationStore.getState();
      expect(state.activeItem).toBe('chat');
      expect(state.chatContext).toBeNull();
    });
  });

  describe('closeChat', () => {
    it('should close chat and return to sessions', () => {
      useNavigationStore.getState().openChat('session-1');
      useNavigationStore.getState().closeChat();

      const state = useNavigationStore.getState();
      expect(state.activeItem).toBe('sessions');
      expect(state.chatContext).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should persist and restore tabs', async () => {
      useNavigationStore.getState().openTab('session-1', 'Chat 1');
      useNavigationStore.getState().openTab('session-2', 'Chat 2');
      useNavigationStore.getState().switchTab('session-2');

      // Wait for debounced saveTabs (300ms) to fire
      await new Promise(r => setTimeout(r, 350));

      // Simulate fresh store
      useNavigationStore.setState({
        activeItem: 'dashboard',
        chatContext: null,
        openTabs: [],
        activeTabId: null,
      });

      await useNavigationStore.getState().restoreTabs();
      const state = useNavigationStore.getState();
      expect(state.openTabs).toHaveLength(2);
      expect(state.openTabs[0].id).toBe('session-1');
      expect(state.openTabs[1].id).toBe('session-2');
      expect(state.activeTabId).toBe('session-2');
    });

    it('should handle empty localStorage gracefully', async () => {
      localStorage.clear();
      await useNavigationStore.getState().restoreTabs();

      const state = useNavigationStore.getState();
      expect(state.openTabs).toHaveLength(0);
      expect(state.activeTabId).toBeNull();
    });
  });
});
