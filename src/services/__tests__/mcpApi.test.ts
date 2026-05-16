import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiClient', () => ({
  apiClient: { invoke: vi.fn() },
  getErrorDetail: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { apiClient } from '../apiClient';
import { mcpApi } from '../mcpApi';

describe('mcpApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listServers invokes list_mcp_servers', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue([
      { name: 'fs', status: 'disconnected', config: { name: 'fs', command: 'npx' } },
    ]);

    const servers = await mcpApi.listServers();

    expect(servers).toHaveLength(1);
    expect(apiClient.invoke).toHaveBeenCalledWith('list_mcp_servers');
  });

  it('listServers returns empty array on failure', async () => {
    vi.mocked(apiClient.invoke).mockRejectedValue(new Error('ipc failed'));

    const servers = await mcpApi.listServers();

    expect(servers).toEqual([]);
  });

  it('addServer forwards request', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue(undefined);

    await mcpApi.addServer({
      name: 'test',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    });

    expect(apiClient.invoke).toHaveBeenCalledWith('add_mcp_server', {
      request: {
        name: 'test',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      },
    });
  });

  it('testConnection invokes test_mcp_connection', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue({ success: true, message: 'ok' });

    const result = await mcpApi.testConnection({ name: 't', command: 'npx' });

    expect(result.success).toBe(true);
    expect(apiClient.invoke).toHaveBeenCalledWith('test_mcp_connection', {
      config: { name: 't', command: 'npx' },
    });
  });

  it('testConnection surfaces backend validation failure', async () => {
    vi.mocked(apiClient.invoke).mockResolvedValue({
      success: false,
      message: 'MCP command contains forbidden character',
      error: 'MCP command contains forbidden character',
    });

    const result = await mcpApi.testConnection({ name: 'bad', command: 'npx; rm' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('forbidden');
  });
});
