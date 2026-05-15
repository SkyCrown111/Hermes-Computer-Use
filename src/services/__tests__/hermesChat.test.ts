import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/tauri', () => ({
  isTauri: vi.fn(() => true),
  HermesApiError: class HermesApiError extends Error {
    code: string;
    detail: string;
    constructor(code: string, detail: string) {
      super(detail);
      this.code = code;
      this.detail = detail;
    }
  },
}));

vi.mock('../apiClient', () => ({
  apiClient: { invoke: vi.fn() },
  getErrorDetail: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isTauri } from '../../lib/tauri';
import { apiClient } from '../apiClient';
import {
  sendMessage,
  interruptSession,
  respondApproval,
  respondSecret,
} from '../hermesChat';

describe('hermesChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauri).mockReturnValue(true);
  });

  it('sendMessage invokes backend with user message', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue({
      session_id: 's1',
      response: 'hi',
    });

    const result = await sendMessage({ message: 'hello', session_id: 's1' });

    expect(result.response).toBe('hi');
    expect(apiClient.invoke).toHaveBeenCalledWith('send_chat_message', {
      messages: [{ role: 'user', content: 'hello' }],
      session_id: 's1',
    });
  });

  it('sendMessage returns mock when not in Tauri', async () => {
    vi.mocked(isTauri).mockReturnValue(false);

    const result = await sendMessage({ message: 'test' });

    expect(result.session_id).toMatch(/^mock_/);
    expect(result.response).toContain('test');
    expect(apiClient.invoke).not.toHaveBeenCalled();
  });

  it('interruptSession invokes interrupt_session', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue(undefined);

    await interruptSession('session-1');

    expect(apiClient.invoke).toHaveBeenCalledWith('interrupt_session', {
      session_id: 'session-1',
    });
  });

  it('respondApproval forwards choice to backend', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue(undefined);

    await respondApproval('ap-1', 'once');

    expect(apiClient.invoke).toHaveBeenCalledWith('respond_approval', {
      approval_id: 'ap-1',
      choice: 'once',
    });
  });

  it('respondSecret forwards value to backend', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue(undefined);

    await respondSecret('sec-1', 'secret-value');

    expect(apiClient.invoke).toHaveBeenCalledWith('respond_secret', {
      secret_id: 'sec-1',
      value: 'secret-value',
    });
  });
});
