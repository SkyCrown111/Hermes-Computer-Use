// Session API Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/tauri', () => ({
  safeInvoke: vi.fn(),
  HermesApiError: class HermesApiError extends Error {
    public code: string;
    public detail: string;
    constructor(code: string, detail: string) {
      super(detail);
      this.name = 'HermesApiError';
      this.code = code;
      this.detail = detail;
    }
  },
}));

import { safeInvoke } from '../../lib/tauri';
import { listSessions, getSession, deleteSession, searchSessions, updateSessionTitle } from '../sessionApi';

describe('SessionApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listSessions', () => {
    it('should return sessions list', async () => {
      const mockResponse = {
        sessions: [
          {
            id: 'session-1',
            platform: 'cli',
            chat_id: '',
            chat_name: 'Test Session',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
            message_count: 5,
            model: 'test-model',
            input_tokens: 100,
            output_tokens: 50,
            estimated_cost_usd: 0.01,
            status: 'completed',
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      };

      vi.mocked(safeInvoke).mockResolvedValue(mockResponse);

      const result = await listSessions();
      expect(result.sessions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.sessions[0].id).toBe('session-1');
      expect(safeInvoke).toHaveBeenCalledWith('list_sessions', {
        platform: undefined,
        limit: 100,
        offset: 0,
      });
    });

    it('should pass platform filter via SessionListParams', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ sessions: [], total: 0, limit: 100, offset: 0 });

      await listSessions({ platform: 'cli' });
      expect(safeInvoke).toHaveBeenCalledWith('list_sessions', { platform: 'cli', limit: 100, offset: 0 });
    });

    it('should pass limit and offset via SessionListParams', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ sessions: [], total: 0, limit: 10, offset: 20 });

      await listSessions({ platform: 'cli', limit: 10, offset: 20 });
      expect(safeInvoke).toHaveBeenCalledWith('list_sessions', { platform: 'cli', limit: 10, offset: 20 });
    });

    it('should return empty list on error', async () => {
      vi.mocked(safeInvoke).mockRejectedValue(new Error('Failed'));

      const result = await listSessions();
      expect(result.sessions).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getSession', () => {
    it('should return SessionMessagesResponse with session_id and messages', async () => {
      const mockResponse = {
        session_id: 'session-1',
        messages: [
          { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() },
        ],
      };

      vi.mocked(safeInvoke).mockResolvedValue(mockResponse);

      const result = await getSession('session-1');
      expect(result).not.toBeNull();
      expect(result!.session_id).toBe('session-1');
      expect(result!.messages).toHaveLength(2);
      expect(safeInvoke).toHaveBeenCalledWith('get_session', { session_id: 'session-1' });
    });

    it('should return null on invoke failure', async () => {
      vi.mocked(safeInvoke).mockRejectedValue(new Error('Connection failed'));

      const result = await getSession('bad-id');
      expect(result).toBeNull();
    });

    it('should return null when response is null', async () => {
      vi.mocked(safeInvoke).mockResolvedValue(null);

      const result = await getSession('bad-id');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      vi.mocked(safeInvoke).mockResolvedValue(undefined);

      await deleteSession('session-1');
      expect(safeInvoke).toHaveBeenCalledWith('delete_session', { session_id: 'session-1' });
    });
  });

  describe('searchSessions', () => {
    it('should search sessions', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({
        query: 'test',
        results: [
          { session_id: 'session-1', platform: 'cli', matched_at: new Date().toISOString() },
        ],
        total: 1,
      });

      const result = await searchSessions({ q: 'test' });
      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(safeInvoke).toHaveBeenCalledWith('search_sessions', { q: 'test' });
    });

    it('should pass platform and days filters', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ query: 'test', results: [], total: 0 });

      await searchSessions({ q: 'test', platform: 'cli', days: 7 });
      expect(safeInvoke).toHaveBeenCalledWith('search_sessions', { q: 'test', platform: 'cli', days: 7 });
    });
  });

  describe('updateSessionTitle', () => {
    it('should update session title', async () => {
      vi.mocked(safeInvoke).mockResolvedValue(undefined);

      await updateSessionTitle('session-1', 'New Title');
      expect(safeInvoke).toHaveBeenCalledWith('update_session_title', { session_id: 'session-1', title: 'New Title' });
    });
  });
});
