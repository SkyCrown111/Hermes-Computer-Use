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

describe('platformApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getPlatforms invokes get_platforms', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue([
      { type: 'telegram', name: 'Telegram', status: 'connected', enabled: true },
    ]);

    const platforms = await platformApi.getPlatforms();

    expect(platforms).toHaveLength(1);
    expect(apiClient.invoke).toHaveBeenCalledWith('get_platforms');
  });

  it('getPlatforms returns empty array on failure', async () => {
    vi.mocked(apiClient.invoke).mockRejectedValue(new Error('offline'));

    const platforms = await platformApi.getPlatforms();

    expect(platforms).toEqual([]);
  });

  it('getPlatformStatus returns disconnected with error on failure', async () => {
    vi.mocked(apiClient.invoke).mockRejectedValue(new Error('timeout'));

    const status = await platformApi.getPlatformStatus('discord');

    expect(status.type).toBe('discord');
    expect(status.status).toBe('disconnected');
    expect(status.error).toContain('timeout');
  });

  it('enablePlatform invokes enable_platform', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue(undefined);

    await platformApi.enablePlatform('telegram');

    expect(apiClient.invoke).toHaveBeenCalledWith('enable_platform', {
      platform_type: 'telegram',
    });
  });
});
