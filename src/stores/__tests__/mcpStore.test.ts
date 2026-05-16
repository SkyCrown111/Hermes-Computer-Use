import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMcpStore } from '../mcpStore';
import { mcpApi } from '../../services/mcpApi';

vi.mock('../../services/mcpApi', () => ({
  mcpApi: {
    listServers: vi.fn(),
    getStats: vi.fn(),
    addServer: vi.fn(),
    updateServer: vi.fn(),
    removeServer: vi.fn(),
    startServer: vi.fn(),
    stopServer: vi.fn(),
    testConnection: vi.fn(),
    getTools: vi.fn(),
    getResources: vi.fn(),
    getLogs: vi.fn(),
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockServer = {
  name: 'filesystem',
  status: 'connected' as const,
  config: { name: 'filesystem', command: 'npx' },
};

describe('McpStore', () => {
  beforeEach(() => {
    useMcpStore.setState({
      servers: [],
      selectedServer: null,
      tools: [],
      resources: [],
      logs: [],
      stats: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
      isAddModalOpen: false,
      isEditModalOpen: false,
      isToolsModalOpen: false,
      isResourcesModalOpen: false,
      isLogsModalOpen: false,
    });
    vi.clearAllMocks();
  });

  it('fetchServers loads servers', async () => {
    vi.mocked(mcpApi.listServers).mockResolvedValue([mockServer]);

    await useMcpStore.getState().fetchServers();

    expect(useMcpStore.getState().servers).toHaveLength(1);
    expect(useMcpStore.getState().isLoading).toBe(false);
  });

  it('fetchServers sets error on failure', async () => {
    vi.mocked(mcpApi.listServers).mockRejectedValue(new Error('ipc failed'));

    await useMcpStore.getState().fetchServers();

    expect(useMcpStore.getState().servers).toEqual([]);
    expect(useMcpStore.getState().error).toBe('ipc failed');
  });

  it('fetchStats uses defaults on failure', async () => {
    vi.mocked(mcpApi.getStats).mockRejectedValue(new Error('stats down'));

    await useMcpStore.getState().fetchStats();

    expect(useMcpStore.getState().stats?.total_servers).toBe(0);
    expect(useMcpStore.getState().error).toBe('stats down');
  });

  it('selectServer finds server by name', () => {
    useMcpStore.setState({ servers: [mockServer] });

    useMcpStore.getState().selectServer('filesystem');

    expect(useMcpStore.getState().selectedServer?.name).toBe('filesystem');
    useMcpStore.getState().selectServer(null);
    expect(useMcpStore.getState().selectedServer).toBeNull();
  });

  it('addServer returns false on failure', async () => {
    vi.mocked(mcpApi.addServer).mockRejectedValue(new Error('duplicate'));

    const ok = await useMcpStore.getState().addServer({ name: 'x', command: 'npx' });

    expect(ok).toBe(false);
    expect(useMcpStore.getState().error).toBe('duplicate');
  });

  it('addServer refreshes list and closes modal', async () => {
    vi.mocked(mcpApi.addServer).mockResolvedValue(undefined);
    vi.mocked(mcpApi.listServers).mockResolvedValue([mockServer]);

    const ok = await useMcpStore.getState().addServer({
      name: 'filesystem',
      command: 'npx',
    });

    expect(ok).toBe(true);
    expect(useMcpStore.getState().isAddModalOpen).toBe(false);
  });

  it('updateServer refreshes list', async () => {
    vi.mocked(mcpApi.updateServer).mockResolvedValue(undefined);
    vi.mocked(mcpApi.listServers).mockResolvedValue([mockServer]);

    const ok = await useMcpStore.getState().updateServer('filesystem', mockServer.config);

    expect(ok).toBe(true);
    expect(useMcpStore.getState().isEditModalOpen).toBe(false);
  });

  it('removeServer clears selection', async () => {
    useMcpStore.setState({ selectedServer: mockServer });
    vi.mocked(mcpApi.removeServer).mockResolvedValue(undefined);
    vi.mocked(mcpApi.listServers).mockResolvedValue([]);

    const ok = await useMcpStore.getState().removeServer('filesystem');

    expect(ok).toBe(true);
    expect(useMcpStore.getState().selectedServer).toBeNull();
  });

  it('startServer and stopServer refresh servers', async () => {
    vi.mocked(mcpApi.startServer).mockResolvedValue(undefined);
    vi.mocked(mcpApi.stopServer).mockResolvedValue(undefined);
    vi.mocked(mcpApi.listServers).mockResolvedValue([mockServer]);

    expect(await useMcpStore.getState().startServer('filesystem')).toBe(true);
    expect(await useMcpStore.getState().stopServer('filesystem')).toBe(true);
  });

  it('testConnection returns success and failure', async () => {
    vi.mocked(mcpApi.testConnection).mockResolvedValueOnce({
      success: true,
      message: 'ok',
    });
    const ok = await useMcpStore.getState().testConnection(mockServer.config);
    expect(ok.success).toBe(true);

    vi.mocked(mcpApi.testConnection).mockRejectedValueOnce(new Error('bad cmd'));
    const fail = await useMcpStore.getState().testConnection(mockServer.config);
    expect(fail.success).toBe(false);
  });

  it('fetchTools fetchResources fetchLogs handle errors', async () => {
    vi.mocked(mcpApi.getTools).mockResolvedValue([{ name: 'read', description: '', input_schema: {} }]);
    await useMcpStore.getState().fetchTools('filesystem');
    expect(useMcpStore.getState().tools).toHaveLength(1);

    vi.mocked(mcpApi.getResources).mockRejectedValue(new Error('no resources'));
    await useMcpStore.getState().fetchResources('filesystem');
    expect(useMcpStore.getState().resources).toEqual([]);

    vi.mocked(mcpApi.getLogs).mockResolvedValue([{ timestamp: 't', level: 'info', message: 'm' }]);
    await useMcpStore.getState().fetchLogs('filesystem');
    expect(useMcpStore.getState().logs).toHaveLength(1);
  });

  it('modal helpers open and close', async () => {
    vi.mocked(mcpApi.getTools).mockResolvedValue([]);
    vi.mocked(mcpApi.getResources).mockResolvedValue([]);
    vi.mocked(mcpApi.getLogs).mockResolvedValue([]);

    useMcpStore.getState().openAddModal();
    expect(useMcpStore.getState().isAddModalOpen).toBe(true);
    useMcpStore.getState().closeAddModal();

    useMcpStore.getState().openEditModal(mockServer);
    expect(useMcpStore.getState().isEditModalOpen).toBe(true);
    useMcpStore.getState().closeEditModal();

    await useMcpStore.getState().openToolsModal('filesystem');
    expect(useMcpStore.getState().isToolsModalOpen).toBe(true);
    useMcpStore.getState().closeToolsModal();

    await useMcpStore.getState().openResourcesModal('filesystem');
    useMcpStore.getState().closeResourcesModal();

    await useMcpStore.getState().openLogsModal('filesystem');
    useMcpStore.getState().closeLogsModal();

    useMcpStore.setState({ error: 'x' });
    useMcpStore.getState().clearError();
    expect(useMcpStore.getState().error).toBeNull();
  });
});
