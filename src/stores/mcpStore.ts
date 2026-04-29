// MCP Store - MCP Server Management State

import { create } from 'zustand';
import type {
  McpServer,
  McpServerConfig,
  McpTool,
  McpResource,
  McpServerStats,
  McpLogEntry,
  AddMcpServerRequest,
} from '../types/mcp';
import { getErrorMessage } from '../lib/errorUtils';
import { mcpApi } from '../services/mcpApi';
import { logger } from '../lib/logger';

interface McpState {
  servers: McpServer[];
  selectedServer: McpServer | null;
  tools: McpTool[];
  resources: McpResource[];
  logs: McpLogEntry[];
  stats: McpServerStats | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  isAddModalOpen: boolean;
  isEditModalOpen: boolean;
  isToolsModalOpen: boolean;
  isResourcesModalOpen: boolean;
  isLogsModalOpen: boolean;

  // Actions
  fetchServers: () => Promise<void>;
  fetchStats: () => Promise<void>;
  selectServer: (name: string | null) => void;
  addServer: (request: AddMcpServerRequest) => Promise<boolean>;
  updateServer: (name: string, config: McpServerConfig) => Promise<boolean>;
  removeServer: (name: string) => Promise<boolean>;
  startServer: (name: string) => Promise<boolean>;
  stopServer: (name: string) => Promise<boolean>;
  testConnection: (config: McpServerConfig) => Promise<{ success: boolean; message: string }>;
  fetchTools: (name: string) => Promise<void>;
  fetchResources: (name: string) => Promise<void>;
  fetchLogs: (name: string) => Promise<void>;
  openAddModal: () => void;
  closeAddModal: () => void;
  openEditModal: (server: McpServer) => void;
  closeEditModal: () => void;
  openToolsModal: (name: string) => Promise<void>;
  closeToolsModal: () => void;
  openResourcesModal: (name: string) => Promise<void>;
  closeResourcesModal: () => void;
  openLogsModal: (name: string) => Promise<void>;
  closeLogsModal: () => void;
  clearError: () => void;
}

const defaultStats: McpServerStats = {
  total_servers: 0,
  connected: 0,
  disconnected: 0,
  error: 0,
  total_tools: 0,
  total_resources: 0,
  total_requests: 0,
  total_errors: 0,
};

export const useMcpStore = create<McpState>((set, get) => ({
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

  // Fetch all MCP servers
  fetchServers: async () => {
    set({ isLoading: true, error: null });
    try {
      const servers = await mcpApi.listServers();
      set({ servers, isLoading: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoading: false, servers: [] });
    }
  },

  // Fetch MCP statistics
  fetchStats: async () => {
    try {
      const stats = await mcpApi.getStats();
      set({ stats });
    } catch (error) {
      logger.warn('[McpStore] fetchStats failed, using defaults:', error);
      set({ stats: defaultStats, error: getErrorMessage(error) });
    }
  },

  // Select a server
  selectServer: (name) => {
    const { servers } = get();
    if (name === null) {
      set({ selectedServer: null });
    } else {
      const server = servers.find((s) => s.name === name) || null;
      set({ selectedServer: server });
    }
  },

  // Add a new server
  addServer: async (request) => {
    try {
      await mcpApi.addServer(request);
      const servers = await mcpApi.listServers();
      set({ servers, isAddModalOpen: false });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // Update server configuration
  updateServer: async (name, config) => {
    try {
      await mcpApi.updateServer(name, config);
      const servers = await mcpApi.listServers();
      set({ servers, isEditModalOpen: false, selectedServer: null });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // Remove a server
  removeServer: async (name) => {
    try {
      await mcpApi.removeServer(name);
      const servers = await mcpApi.listServers();
      set({ servers, selectedServer: null });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // Start a server
  startServer: async (name) => {
    try {
      await mcpApi.startServer(name);
      const servers = await mcpApi.listServers();
      set({ servers });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // Stop a server
  stopServer: async (name) => {
    try {
      await mcpApi.stopServer(name);
      const servers = await mcpApi.listServers();
      set({ servers });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  // Test connection
  testConnection: async (config) => {
    try {
      const result = await mcpApi.testConnection(config);
      return { success: result.success, message: result.message };
    } catch (err) {
      return { success: false, message: getErrorMessage(err) };
    }
  },

  // Fetch tools for a server
  fetchTools: async (name) => {
    try {
      const tools = await mcpApi.getTools(name);
      set({ tools });
    } catch (error) {
      logger.warn('[McpStore] fetchTools failed:', error);
      set({ tools: [], error: getErrorMessage(error) });
    }
  },

  // Fetch resources for a server
  fetchResources: async (name) => {
    try {
      const resources = await mcpApi.getResources(name);
      set({ resources });
    } catch (error) {
      logger.warn('[McpStore] fetchResources failed:', error);
      set({ resources: [], error: getErrorMessage(error) });
    }
  },

  // Fetch logs for a server
  fetchLogs: async (name) => {
    try {
      const logs = await mcpApi.getLogs(name);
      set({ logs });
    } catch (error) {
      logger.warn('[McpStore] fetchLogs failed:', error);
      set({ logs: [], error: getErrorMessage(error) });
    }
  },

  // Modal controls
  openAddModal: () => set({ isAddModalOpen: true }),
  closeAddModal: () => set({ isAddModalOpen: false }),
  openEditModal: (server) => set({ selectedServer: server, isEditModalOpen: true }),
  closeEditModal: () => set({ isEditModalOpen: false, selectedServer: null }),

  openToolsModal: async (name) => {
    set({ isToolsModalOpen: true, tools: [] });
    await get().fetchTools(name);
  },
  closeToolsModal: () => set({ isToolsModalOpen: false, tools: [] }),

  openResourcesModal: async (name) => {
    set({ isResourcesModalOpen: true, resources: [] });
    await get().fetchResources(name);
  },
  closeResourcesModal: () => set({ isResourcesModalOpen: false, resources: [] }),

  openLogsModal: async (name) => {
    set({ isLogsModalOpen: true, logs: [] });
    await get().fetchLogs(name);
  },
  closeLogsModal: () => set({ isLogsModalOpen: false, logs: [] }),

  clearError: () => set({ error: null }),
}));
