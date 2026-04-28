import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type {
  McpServer,
  McpServerConfig,
  McpTool,
  McpResource,
  McpServerStats,
  McpConnectionTestResult,
  McpLogEntry,
  AddMcpServerRequest,
} from '../types/mcp';

export const mcpApi = {
  listServers: async (): Promise<McpServer[]> => {
    try {
      return await apiClient.invoke<McpServer[]>('list_mcp_servers');
    } catch (error) {
      logger.error('[McpApi] listServers failed:', getErrorDetail(error));
      return [];
    }
  },

  getServer: async (name: string): Promise<McpServer> => {
    return apiClient.invoke<McpServer>('get_mcp_server', { name });
  },

  addServer: async (request: AddMcpServerRequest): Promise<void> => {
    await apiClient.invoke('add_mcp_server', { request });
  },

  removeServer: async (name: string): Promise<void> => {
    await apiClient.invoke('remove_mcp_server', { name });
  },

  updateServer: async (name: string, config: McpServerConfig): Promise<void> => {
    await apiClient.invoke('update_mcp_server', { name, config });
  },

  startServer: async (name: string): Promise<void> => {
    await apiClient.invoke('start_mcp_server', { name });
  },

  stopServer: async (name: string): Promise<void> => {
    await apiClient.invoke('stop_mcp_server', { name });
  },

  testConnection: async (config: McpServerConfig): Promise<McpConnectionTestResult> => {
    return apiClient.invoke<McpConnectionTestResult>('test_mcp_connection', { config });
  },

  getTools: async (name: string): Promise<McpTool[]> => {
    try {
      return await apiClient.invoke<McpTool[]>('get_mcp_tools', { name });
    } catch (error) {
      logger.error('[McpApi] getTools failed:', getErrorDetail(error));
      return [];
    }
  },

  getResources: async (name: string): Promise<McpResource[]> => {
    try {
      return await apiClient.invoke<McpResource[]>('get_mcp_resources', { name });
    } catch (error) {
      logger.error('[McpApi] getResources failed:', getErrorDetail(error));
      return [];
    }
  },

  getLogs: async (name: string): Promise<McpLogEntry[]> => {
    try {
      return await apiClient.invoke<McpLogEntry[]>('get_mcp_logs', { name });
    } catch (error) {
      logger.error('[McpApi] getLogs failed:', getErrorDetail(error));
      return [];
    }
  },

  getStats: async (): Promise<McpServerStats> => {
    try {
      return await apiClient.invoke<McpServerStats>('get_mcp_stats');
    } catch (error) {
      logger.error('[McpApi] getStats failed:', getErrorDetail(error));
      return { total_servers: 0, connected: 0, disconnected: 0, error: 0, total_tools: 0, total_resources: 0, total_requests: 0, total_errors: 0 };
    }
  },
};
