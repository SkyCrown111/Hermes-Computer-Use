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
import {
  listSessions,
  getSession,
  deleteSession,
  searchSessions,
  updateSessionTitle,
  exportSessions,
  countSessions,
  getCheckpointInfo,
  restoreCheckpoint,
  deleteCheckpoint,
} from '../sessionApi';

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
      expect(safeInvoke).toHaveBeenCalledWith('get_session', { id: 'session-1' });
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
      expect(safeInvoke).toHaveBeenCalledWith('delete_session', { id: 'session-1' });
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
      expect(safeInvoke).toHaveBeenCalledWith('update_session_title', { id: 'session-1', title: 'New Title' });
    });
  });

  describe('exportSessions', () => {
    it('should return raw export text', async () => {
      vi.mocked(safeInvoke).mockResolvedValue('{"session":{"id":"session-1"}}');

      const result = await exportSessions({ format: 'json', session_id: 'session-1' });

      expect(result).toBe('{"session":{"id":"session-1"}}');
      expect(safeInvoke).toHaveBeenCalledWith('export_session', {
        format: 'json',
        session_id: 'session-1',
        platform: undefined,
      });
    });
  });

  describe('countSessions', () => {
    it('should pass platform null and unwrap count', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ count: 7 });

      const result = await countSessions();

      expect(result).toBe(7);
      expect(safeInvoke).toHaveBeenCalledWith('count_sessions', { platform: null });
    });
  });

  describe('checkpoint helpers', () => {
    it('should map v2 checkpoint info to frontend shape', async () => {
      const meta = {
        id: 'cp-1',
        sessionId: 'session-1',
        name: 'Checkpoint 1',
        createdAt: new Date().toISOString(),
        messageCount: 12,
        sizeBytes: 256,
        description: 'snapshot',
      };
      vi.mocked(safeInvoke).mockResolvedValue(meta);

      const result = await getCheckpointInfo('cp-1');

      expect(result).toMatchObject({
        id: 'cp-1',
        session_id: 'session-1',
        name: 'Checkpoint 1',
        message_count: 12,
        size_bytes: 256,
        description: 'snapshot',
      });
      expect(safeInvoke).toHaveBeenCalledWith('get_checkpoint_info_v2', { checkpoint_id: 'cp-1' });
    });

    it('should restore checkpoint via v2 and return success payload', async () => {
      vi.mocked(safeInvoke).mockResolvedValue(undefined);

      const result = await restoreCheckpoint('session-1', 'cp-1');

      expect(result.success).toBe(true);
      expect(result.session_id).toBe('session-1');
      expect(result.checkpoint_id).toBe('cp-1');
      expect(safeInvoke).toHaveBeenCalledWith('restore_checkpoint_v2', { checkpoint_id: 'cp-1' });
    });

    it('should normalize delete checkpoint to ok response', async () => {
      vi.mocked(safeInvoke).mockResolvedValue(undefined);

      const result = await deleteCheckpoint('cp-1');

      expect(result).toEqual({ ok: true });
      expect(safeInvoke).toHaveBeenCalledWith('delete_checkpoint_v2', { checkpoint_id: 'cp-1' });
    });
  });
});
