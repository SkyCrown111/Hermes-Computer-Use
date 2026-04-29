// API Client Tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiClient } from '../apiClient';

// Mock safeInvoke
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

import { safeInvoke, HermesApiError } from '../../lib/tauri';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient({ retries: 1 }); // Single attempt for most tests
    vi.clearAllMocks();
  });

  describe('invoke - success', () => {
    it('should return the result on successful invoke', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ status: 'ok' });

      const result = await client.invoke('health_check');

      expect(result).toEqual({ status: 'ok' });
      expect(safeInvoke).toHaveBeenCalledWith('health_check', undefined);
    });

    it('should pass args to safeInvoke', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ id: '123' });

      const result = await client.invoke('get_session', { id: '123' });

      expect(result).toEqual({ id: '123' });
      expect(safeInvoke).toHaveBeenCalledWith('get_session', { id: '123' });
    });

    it('should return typed results', async () => {
      vi.mocked(safeInvoke).mockResolvedValue({ sessions: [], total: 0 });

      const result = await client.invoke<{ sessions: unknown[]; total: number }>('list_sessions');
      expect(result.total).toBe(0);
      expect(result.sessions).toEqual([]);
    });
  });

  describe('invoke - error handling', () => {
    it('should throw HermesApiError on failure', async () => {
      vi.mocked(safeInvoke).mockRejectedValue(new HermesApiError('unknown', 'Connection refused'));

      await expect(client.invoke('health_check')).rejects.toThrow('Connection refused');
    });

    it('should classify network errors', async () => {
      vi.mocked(safeInvoke).mockRejectedValue(new HermesApiError('network', 'Network error'));

      try {
        await client.invoke('list_sessions');
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        expect(err).toBeDefined();
        if (err instanceof HermesApiError) {
          expect(err.detail).toContain('Network error');
        }
      }
    });
  });

  describe('invoke - timeout and retry options', () => {
    it('should accept timeout option', async () => {
      vi.mocked(safeInvoke).mockResolvedValue('ok');

      await client.invoke('health_check', undefined, { timeout: 5000 });

      expect(safeInvoke).toHaveBeenCalledWith('health_check', undefined);
    });

    it('should accept retries and retryDelay options', async () => {
      vi.mocked(safeInvoke).mockResolvedValue('ok');

      await client.invoke('health_check', undefined, { retries: 1, retryDelay: 100 });

      expect(safeInvoke).toHaveBeenCalledWith('health_check', undefined);
    });
  });

  describe('retry', () => {
    it('should retry on failure and succeed', async () => {
      const retryClient = new ApiClient({ retries: 3, retryDelay: 10 });

      vi.mocked(safeInvoke)
        .mockRejectedValueOnce(new HermesApiError('network', 'Network error'))
        .mockRejectedValueOnce(new HermesApiError('network', 'Network error'))
        .mockResolvedValueOnce('success');

      const result = await retryClient.invoke('health_check');

      expect(result).toBe('success');
      expect(safeInvoke).toHaveBeenCalledTimes(3);
    });

    it('should throw after exhausting retries', async () => {
      const retryClient = new ApiClient({ retries: 2, retryDelay: 10 });

      vi.mocked(safeInvoke).mockRejectedValue(new HermesApiError('network', 'Network error'));

      await expect(retryClient.invoke('health_check')).rejects.toThrow('Network error');
      expect(safeInvoke).toHaveBeenCalledTimes(2); // 2 attempts total
    });

    it('should not retry on non-retryable errors', async () => {
      vi.mocked(safeInvoke).mockRejectedValue(new HermesApiError('not_found', 'Not found'));

      const retryClient = new ApiClient({ retries: 3, retryDelay: 10 });

      await expect(retryClient.invoke('health_check')).rejects.toThrow('Not found');
      expect(safeInvoke).toHaveBeenCalledTimes(1); // No retry for not_found
    });
  });
});
