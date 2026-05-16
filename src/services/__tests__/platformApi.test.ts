import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { invoke: vi.fn() },
  getErrorDetail: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { apiClient } from '../apiClient';
import { platformApi } from '../platformApi';

describe('platformApi messaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPlatformChats invokes get_platform_chats', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue([
      { chat_id: 'c1', chat_type: 'dm', name: 'Alice', platform: 'telegram' },
    ]);

    const chats = await platformApi.getPlatformChats('telegram', 20);

    expect(chats).toHaveLength(1);
    expect(apiClient.invoke).toHaveBeenCalledWith('get_platform_chats', {
      platform_type: 'telegram',
      limit: 20,
    });
  });

  it('getPlatformMessages invokes get_platform_messages', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue([
      {
        message_id: 'm1',
        chat_id: 'c1',
        sender_id: 'u1',
        content: 'hi',
        timestamp: '2026-05-15T00:00:00Z',
        is_from_me: false,
      },
    ]);

    const messages = await platformApi.getPlatformMessages('telegram', 'c1', { limit: 50 });

    expect(messages[0].content).toBe('hi');
    expect(apiClient.invoke).toHaveBeenCalledWith('get_platform_messages', {
      platform_type: 'telegram',
      chat_id: 'c1',
      limit: 50,
      before_id: null,
      tail_offset: null,
    });
  });

  it('sendPlatformMessage invokes send_platform_message', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue({ success: true });

    const result = await platformApi.sendPlatformMessage('telegram', 'c1', 'hello');

    expect(result.success).toBe(true);
    expect(apiClient.invoke).toHaveBeenCalledWith('send_platform_message', {
      platform_type: 'telegram',
      chat_id: 'c1',
      message: 'hello',
    });
  });
});
