// Session Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../sessionStore';
import type { Session, SessionMessage } from '../../types';

// Mock the sessionApi module
vi.mock('../../services', () => ({
  sessionApi: {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    deleteSession: vi.fn(),
    updateSessionTitle: vi.fn(),
    searchSessions: vi.fn(),
  },
}));

// Mock the navigationStore
vi.mock('../navigationStore', () => ({
  useNavigationStore: {
    getState: () => ({
      activeTabId: null,
      openTabs: [],
      updateTabTitle: vi.fn(),
      saveTabs: vi.fn(),
    }),
  },
}));

// Mock the logger
vi.mock('../../lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { sessionApi } from '../../services';

// Type the mock for testing
const mockSessionApi = vi.mocked(sessionApi);

// Helper to create a valid SessionMessage
const createMockMessage = (role: 'user' | 'assistant' | 'system', content: string): SessionMessage => ({
  role,
  content,
  timestamp: '2024-01-01T00:00:00Z',
});

describe('SessionStore', () => {
  beforeEach(() => {
    // Reset store state
    useSessionStore.setState({
      sessions: [],
      total: 0,
      isLoading: false,
      error: null,
      lastLoadedAt: null,
      currentSession: null,
      messages: [],
      isLoadingMessages: false,
      messageCache: {},
      platform: null,
      searchQuery: '',
      limit: 20,
      offset: 0,
      refreshKey: 0,
      optimisticSessionIds: new Set(),
    });
    vi.clearAllMocks();
  });

  describe('fetchSessions', () => {
    it('should fetch and store session list', async () => {
      const mockSessions: Session[] = [
        { id: 'session-1', chat_name: 'Test Chat', platform: 'cli', model: 'gpt-4', message_count: 5, started_at: '2024-01-01T00:00:00Z', last_activity_at: '2024-01-01T02:00:00Z', chat_id: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        { id: 'session-2', chat_name: 'Another Chat', platform: 'api', model: 'claude-3', message_count: 10, started_at: '2024-01-01T00:00:00Z', last_activity_at: '2024-01-01T01:00:00Z', chat_id: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
      ];

      mockSessionApi.listSessions.mockResolvedValueOnce({
        sessions: mockSessions,
        total: 2,
        limit: 20,
        offset: 0,
      });

      await useSessionStore.getState().fetchSessions();

      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(2);
      // Sessions are sorted by last_activity_at descending
      expect(state.sessions[0].id).toBe('session-1'); // Has later timestamp
      expect(state.total).toBe(2);
      expect(state.isLoading).toBe(false);
    });

    it('should handle fetch errors gracefully', async () => {
      mockSessionApi.listSessions.mockRejectedValueOnce(new Error('Network error'));

      await useSessionStore.getState().fetchSessions();

      const state = useSessionStore.getState();
      expect(state.sessions).toEqual([]);
      expect(state.error).toBe('Network error');
    });
  });

  describe('fetchMessages', () => {
    it('should fetch messages for a session', async () => {
      const mockMessages: SessionMessage[] = [
        createMockMessage('user', 'Hello'),
        createMockMessage('assistant', 'Hi there!'),
      ];

      mockSessionApi.getSession.mockResolvedValueOnce({
        session_id: 'session-1',
        messages: mockMessages,
      });

      const messages = await useSessionStore.getState().fetchMessages('session-1');

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hello');

      const state = useSessionStore.getState();
      expect(state.messageCache['session-1']).toBeDefined();
      expect(state.messageCache['session-1']).toHaveLength(2);
    });

    it('should return cached messages on subsequent calls', async () => {
      const mockMessages: SessionMessage[] = [
        createMockMessage('user', 'Cached'),
      ];

      mockSessionApi.getSession.mockResolvedValueOnce({
        session_id: 'session-1',
        messages: mockMessages,
      });

      // First call
      await useSessionStore.getState().fetchMessages('session-1');

      // Second call should use cache (no additional API call)
      const messages = await useSessionStore.getState().fetchMessages('session-1');

      expect(mockSessionApi.getSession).toHaveBeenCalledTimes(1);
      expect(messages[0].content).toBe('Cached');
    });
  });

  describe('deleteSession', () => {
    it('should delete a session from the list', async () => {
      useSessionStore.setState({
        sessions: [
          { id: 'session-1', chat_name: 'Test', started_at: '', last_activity_at: '', platform: 'cli', chat_id: '', message_count: 0, model: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
          { id: 'session-2', chat_name: 'Another', started_at: '', last_activity_at: '', platform: 'cli', chat_id: '', message_count: 0, model: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        ],
        total: 2,
      });

      mockSessionApi.deleteSession.mockResolvedValueOnce({ ok: true });

      await useSessionStore.getState().deleteSession('session-1');

      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('session-2');
    });

    it('should clear message cache when deleting session', async () => {
      useSessionStore.setState({
        sessions: [
          { id: 'session-1', chat_name: 'Test', started_at: '', last_activity_at: '', platform: 'cli', chat_id: '', message_count: 0, input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        ],
        messageCache: {
          'session-1': [{ role: 'user', content: 'Hello', timestamp: '' }],
        },
      });

      mockSessionApi.deleteSession.mockResolvedValueOnce({ ok: true });

      await useSessionStore.getState().deleteSession('session-1');

      const state = useSessionStore.getState();
      expect(state.messageCache['session-1']).toBeUndefined();
    });
  });

  describe('updateSessionTitle', () => {
    it('should update session title in the list', async () => {
      useSessionStore.setState({
        sessions: [
          { id: 'session-1', chat_name: 'Old Title', started_at: '', last_activity_at: '', platform: 'cli', chat_id: '', message_count: 0, model: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        ],
      });

      mockSessionApi.updateSessionTitle.mockResolvedValueOnce({ ok: true });

      await useSessionStore.getState().updateSessionTitle('session-1', 'New Title');

      const state = useSessionStore.getState();
      expect(state.sessions[0].chat_name).toBe('New Title');
    });
  });

  describe('addSessionOptimistic', () => {
    it('should add a session optimistically to the list', () => {
      useSessionStore.setState({ sessions: [], optimisticSessionIds: new Set() });

      useSessionStore.getState().addSessionOptimistic('new-session-1');

      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('new-session-1');
      expect(state.optimisticSessionIds.has('new-session-1')).toBe(true);
    });

    it('should not add duplicate sessions', () => {
      useSessionStore.setState({
        sessions: [
          { id: 'existing-session', chat_name: 'Existing', started_at: '', last_activity_at: '', platform: 'cli', chat_id: '', message_count: 0, model: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        ],
        optimisticSessionIds: new Set(),
      });

      useSessionStore.getState().addSessionOptimistic('existing-session');

      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
    });
  });

  describe('setPlatform', () => {
    it('should set platform filter and reset pagination', () => {
      useSessionStore.setState({ platform: null, offset: 100 });
      useSessionStore.getState().setPlatform('cli');

      const state = useSessionStore.getState();
      expect(state.platform).toBe('cli');
      expect(state.offset).toBe(0);
    });

    it('should clear platform filter with null', () => {
      useSessionStore.setState({ platform: 'cli' });
      useSessionStore.getState().setPlatform(null);
      expect(useSessionStore.getState().platform).toBeNull();
    });
  });

  describe('setSearchQuery', () => {
    it('should set search query', () => {
      useSessionStore.getState().setSearchQuery('test query');
      expect(useSessionStore.getState().searchQuery).toBe('test query');
    });
  });

  describe('setPagination', () => {
    it('should update pagination settings', () => {
      useSessionStore.getState().setPagination(50, 100);
      expect(useSessionStore.getState().limit).toBe(50);
      expect(useSessionStore.getState().offset).toBe(100);
    });
  });

  describe('refreshSessions', () => {
    it('should increment refresh key', () => {
      const initialKey = useSessionStore.getState().refreshKey;
      useSessionStore.getState().refreshSessions();
      expect(useSessionStore.getState().refreshKey).toBe(initialKey + 1);
    });
  });

  describe('clearCache', () => {
    it('should clear specific session cache', () => {
      useSessionStore.setState({
        messageCache: {
          'session-1': [{ role: 'user', content: 'A', timestamp: '' }],
          'session-2': [{ role: 'user', content: 'B', timestamp: '' }],
        },
      });

      useSessionStore.getState().clearCache('session-1');

      const state = useSessionStore.getState();
      expect(state.messageCache['session-1']).toBeUndefined();
      expect(state.messageCache['session-2']).toBeDefined();
    });

    it('should clear all cache when no session ID provided', () => {
      useSessionStore.setState({
        messageCache: {
          'session-1': [{ role: 'user', content: 'A', timestamp: '' }],
          'session-2': [{ role: 'user', content: 'B', timestamp: '' }],
        },
      });

      useSessionStore.getState().clearCache();

      expect(useSessionStore.getState().messageCache).toEqual({});
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      useSessionStore.setState({ error: 'Some error' });
      useSessionStore.getState().clearError();
      expect(useSessionStore.getState().error).toBeNull();
    });
  });

  describe('clearCurrentSession', () => {
    it('should clear current session and messages', () => {
      useSessionStore.setState({
        currentSession: { id: 'session-1', chat_name: 'Test', started_at: '', last_activity_at: '', platform: 'cli', chat_id: '', message_count: 0, model: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        messages: [{ role: 'user', content: 'Hello', timestamp: '' }],
      });

      useSessionStore.getState().clearCurrentSession();

      const state = useSessionStore.getState();
      expect(state.currentSession).toBeNull();
      expect(state.messages).toEqual([]);
    });
  });

  describe('updateSessionActivity', () => {
    it('should update session activity and increment message count', () => {
      useSessionStore.setState({
        sessions: [
          { id: 'session-1', chat_name: 'Test', message_count: 5, last_activity_at: '2024-01-01T00:00:00Z', started_at: '', platform: 'cli', chat_id: '', model: '', input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0, status: 'active' },
        ],
      });

      useSessionStore.getState().updateSessionActivity('session-1');

      const state = useSessionStore.getState();
      expect(state.sessions[0].message_count).toBe(6);
      expect(state.sessions[0].last_activity_at).not.toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('getCachedMessages', () => {
    it('should return cached messages for a session', () => {
      useSessionStore.setState({
        messageCache: {
          'session-1': [{ role: 'user', content: 'Hello', timestamp: '' }],
        },
      });

      const cached = useSessionStore.getState().getCachedMessages('session-1');
      expect(cached).toBeDefined();
      expect(cached).toHaveLength(1);
      if (cached) {
        expect(cached[0].content).toBe('Hello');
      }
    });

    it('should return empty array for non-cached session', () => {
      const cached = useSessionStore.getState().getCachedMessages('unknown-session');
      expect(cached).toEqual([]);
    });
  });
});
