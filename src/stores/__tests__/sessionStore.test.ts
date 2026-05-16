// Session Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../sessionStore';
import type { Session, SessionMessage } from '../../types';
import type { Checkpoint } from '../../types/checkpoint';

const navigationTestState = vi.hoisted(() => ({
  openTabs: [] as { id: string; title?: string }[],
  updateTabTitle: vi.fn(),
  saveTabs: vi.fn(),
  closeTab: vi.fn(),
}));

const chatMocks = vi.hoisted(() => ({
  loadMessages: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('../../lib/sessionMessageAdapter', () => ({
  adaptSessionMessagesToChat: vi.fn(() => []),
}));

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

vi.mock('../../services/sessionApi', () => ({
  listCheckpoints: vi.fn(),
  createCheckpoint: vi.fn(),
  deleteCheckpoint: vi.fn(),
  restoreCheckpoint: vi.fn(),
}));

vi.mock('../chatStore', () => ({
  useChatStore: {
    getState: () => ({
      loadMessages: chatMocks.loadMessages,
      clearSession: chatMocks.clearSession,
    }),
  },
}));

// Mock the navigationStore
vi.mock('../navigationStore', () => ({
  useNavigationStore: {
    getState: () => ({
      activeTabId: null,
      openTabs: navigationTestState.openTabs,
      updateTabTitle: navigationTestState.updateTabTitle,
      saveTabs: navigationTestState.saveTabs,
      closeTab: navigationTestState.closeTab,
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
import * as sessionApiRaw from '../../services/sessionApi';

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
    navigationTestState.openTabs.length = 0;
    chatMocks.loadMessages.mockClear();
    chatMocks.clearSession.mockClear();
    navigationTestState.closeTab.mockClear();
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
      checkpoints: [],
      isLoadingCheckpoints: false,
      checkpointsBySession: {},
      _fetchReqId: 0,
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

    it('when currentSession exists, updates messages without replacing currentSession', async () => {
      const session: Session = {
        id: 'x1',
        chat_name: 'X',
        started_at: '',
        last_activity_at: '',
        platform: 'cli',
        chat_id: '',
        message_count: 0,
        model: '',
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        status: 'active',
      };
      useSessionStore.setState({ currentSession: session, sessions: [session] });
      const fresh = [createMockMessage('assistant', 'up')];
      mockSessionApi.getSession.mockResolvedValueOnce({ session_id: 'x1', messages: fresh });
      const msgs = await useSessionStore.getState().fetchMessages('x1');
      expect(msgs).toEqual(fresh);
      expect(useSessionStore.getState().currentSession?.chat_name).toBe('X');
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

  describe('filters and pagination', () => {
    it('should set platform search query and pagination', () => {
      useSessionStore.getState().setPlatform('telegram');
      useSessionStore.getState().setSearchQuery('hello');
      useSessionStore.getState().setPagination(50, 10);

      const state = useSessionStore.getState();
      expect(state.platform).toBe('telegram');
      expect(state.searchQuery).toBe('hello');
      expect(state.limit).toBe(50);
      expect(state.offset).toBe(10);
    });

    it('should bump refreshKey via refreshSessions', async () => {
      mockSessionApi.listSessions.mockResolvedValue({ sessions: [], total: 0 });
      const before = useSessionStore.getState().refreshKey;
      useSessionStore.getState().refreshSessions();
      expect(useSessionStore.getState().refreshKey).toBeGreaterThan(before);
    });
  });

  describe('fetchSession', () => {
    it('should load session and messages from API', async () => {
      mockSessionApi.getSession.mockResolvedValue({
        session_id: 'session-1',
        messages: [createMockMessage('user', 'hello')],
      });

      const messages = await useSessionStore.getState().fetchSession('session-1');

      expect(messages).toHaveLength(1);
      expect(useSessionStore.getState().currentSession?.id).toBe('session-1');
    });

    it('returns cached messages and triggers background refresh', async () => {
      const cached = [createMockMessage('user', 'cached')];
      useSessionStore.setState({
        messageCache: { c1: cached },
        sessions: [
          {
            id: 'c1',
            chat_name: 'C',
            started_at: '',
            last_activity_at: '',
            platform: 'cli',
            chat_id: '',
            message_count: 1,
            model: '',
            input_tokens: 0,
            output_tokens: 0,
            estimated_cost_usd: 0,
            status: 'active',
          },
        ],
      });
      mockSessionApi.getSession.mockResolvedValue({
        session_id: 'c1',
        messages: [createMockMessage('assistant', 'fresh')],
      });
      const out = await useSessionStore.getState().fetchSession('c1');
      expect(out[0].content).toBe('cached');
      expect(mockSessionApi.getSession).toHaveBeenCalledWith('c1');
    });
  });

  describe('checkpoints', () => {
    it('should fetch create and delete checkpoints', async () => {
      const cp = {
        id: 'cp-1',
        session_id: 'session-1',
        name: 'snap',
        created_at: '2026-05-15T00:00:00Z',
        message_count: 1,
      };
      vi.mocked(sessionApiRaw.listCheckpoints).mockResolvedValue([cp]);
      vi.mocked(sessionApiRaw.createCheckpoint).mockResolvedValue(cp);
      vi.mocked(sessionApiRaw.deleteCheckpoint).mockResolvedValue(undefined);

      const listed = await useSessionStore.getState().fetchCheckpoints('session-1');
      expect(listed).toHaveLength(1);

      const created = await useSessionStore.getState().createCheckpoint('session-1', 'snap');
      expect(created.id).toBe('cp-1');

      await useSessionStore.getState().deleteCheckpoint('cp-1', 'session-1');
      expect(sessionApiRaw.deleteCheckpoint).toHaveBeenCalledWith('cp-1');
    });

    it('throws when createCheckpoint returns empty', async () => {
      vi.mocked(sessionApiRaw.createCheckpoint).mockResolvedValue(null as unknown as Checkpoint);
      await expect(
        useSessionStore.getState().createCheckpoint('session-1', 'n'),
      ).rejects.toThrow('Failed to create checkpoint');
    });

    it('clears checkpoints state', () => {
      useSessionStore.setState({
        checkpoints: [{ id: 'c', session_id: 's', name: 'n', created_at: '', message_count: 0 }],
        checkpointsBySession: { s: [] },
      });
      useSessionStore.getState().clearCheckpoints();
      const st = useSessionStore.getState();
      expect(st.checkpoints).toEqual([]);
      expect(st.checkpointsBySession).toEqual({});
    });

    it('restoreCheckpoint refreshes session and syncs chat tab', async () => {
      navigationTestState.openTabs.push({ id: 'rs1', title: 'R' });
      vi.mocked(sessionApiRaw.restoreCheckpoint).mockResolvedValue(undefined);
      const msg = createMockMessage('user', 'after');
      mockSessionApi.getSession
        .mockResolvedValueOnce({ session_id: 'rs1', messages: [msg] })
        .mockResolvedValueOnce({ session_id: 'rs1', messages: [msg] });

      await useSessionStore.getState().restoreCheckpoint('rs1', 'cp-9');

      expect(sessionApiRaw.restoreCheckpoint).toHaveBeenCalledWith('rs1', 'cp-9');
      expect(chatMocks.loadMessages).toHaveBeenCalled();
    });
  });

  describe('fetchSessions edge cases', () => {
    it('skips network when recently loaded and not forced', async () => {
      useSessionStore.setState({ lastLoadedAt: Date.now(), sessions: [], total: 0 });
      await useSessionStore.getState().fetchSessions();
      expect(mockSessionApi.listSessions).not.toHaveBeenCalled();
    });

    it('injects optimistic session for new_ tabs', async () => {
      navigationTestState.openTabs.push({ id: 'new_abc', title: 'Draft' });
      mockSessionApi.listSessions.mockResolvedValueOnce({
        sessions: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
      await useSessionStore.getState().fetchSessions(undefined, undefined, undefined, true);
      expect(useSessionStore.getState().sessions.some((x) => x.id === 'new_abc')).toBe(true);
    });

    it('fetches missing open tab session and merges', async () => {
      navigationTestState.openTabs.push({ id: 'orphan', title: 'T' });
      mockSessionApi.listSessions.mockResolvedValueOnce({
        sessions: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
      mockSessionApi.getSession.mockResolvedValueOnce({
        session_id: 'orphan',
        messages: [createMockMessage('user', 'hi')],
      });
      await useSessionStore.getState().fetchSessions(undefined, undefined, undefined, true);
      expect(mockSessionApi.getSession).toHaveBeenCalledWith('orphan');
      expect(useSessionStore.getState().sessions.some((x) => x.id === 'orphan')).toBe(true);
    });

    it('closes tab when getSession fails for orphan tab', async () => {
      navigationTestState.openTabs.push({ id: 'gone', title: 'T' });
      mockSessionApi.listSessions.mockResolvedValueOnce({
        sessions: [],
        total: 0,
        limit: 20,
        offset: 0,
      });
      mockSessionApi.getSession.mockRejectedValueOnce(new Error('404'));
      await useSessionStore.getState().fetchSessions(undefined, undefined, undefined, true);
      expect(navigationTestState.closeTab).toHaveBeenCalledWith('gone');
    });

    it('applies hermes-session-titles from localStorage', async () => {
      localStorage.setItem('hermes-session-titles', JSON.stringify({ 'session-1': 'Renamed' }));
      mockSessionApi.listSessions.mockResolvedValueOnce({
        sessions: [
          {
            id: 'session-1',
            chat_name: 'Old',
            platform: 'cli',
            model: '',
            message_count: 0,
            started_at: '2024-01-01T00:00:00Z',
            last_activity_at: '2024-01-02T00:00:00Z',
            chat_id: '',
            input_tokens: 0,
            output_tokens: 0,
            estimated_cost_usd: 0,
            status: 'active',
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      });
      await useSessionStore.getState().fetchSessions(undefined, undefined, undefined, true);
      expect(useSessionStore.getState().sessions[0].chat_name).toBe('Renamed');
    });
  });

  describe('searchSessions', () => {
    it('maps search results into sessions', async () => {
      mockSessionApi.searchSessions.mockResolvedValueOnce({
        query: 'q',
        results: [
          { session_id: 's-search', platform: 'cli', matched_at: '2024-01-03T00:00:00Z' },
        ],
        total: 1,
      });
      await useSessionStore.getState().searchSessions('q', 'cli', 7);
      expect(mockSessionApi.searchSessions).toHaveBeenCalledWith({ q: 'q', platform: 'cli', days: 7 });
      expect(useSessionStore.getState().sessions[0].id).toBe('s-search');
    });

    it('handles search failure', async () => {
      mockSessionApi.searchSessions.mockRejectedValueOnce(new Error('find fail'));
      await useSessionStore.getState().searchSessions('q');
      expect(useSessionStore.getState().error).toBe('find fail');
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
