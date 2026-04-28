// MCP API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
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
  // List all MCP servers
  async listServers(): Promise<McpServer[]> {
    return safeInvoke<McpServer[]>('list_mcp_servers');
  },

  // Get a single MCP server by name
  async getServer(name: string): Promise<McpServer> {
    return safeInvoke<McpServer>('get_mcp_server', { name });
  },

  // Add a new MCP server
  async addServer(request: AddMcpServerRequest): Promise<void> {
    await safeInvoke('add_mcp_server', { request });
  },

  // Remove an MCP server
  async removeServer(name: string): Promise<void> {
    await safeInvoke('remove_mcp_server', { name });
  },

  // Update MCP server configuration
  async updateServer(name: string, config: McpServerConfig): Promise<void> {
    await safeInvoke('update_mcp_server', { name, config });
  },

  // Start an MCP server
  async startServer(name: string): Promise<void> {
    await safeInvoke('start_mcp_server', { name });
  },

  // Stop an MCP server
  async stopServer(name: string): Promise<void> {
    await safeInvoke('stop_mcp_server', { name });
  },

  // Test MCP connection
  async testConnection(config: McpServerConfig): Promise<McpConnectionTestResult> {
    return safeInvoke<McpConnectionTestResult>('test_mcp_connection', { config });
  },

  // Get tools for an MCP server
  async getTools(name: string): Promise<McpTool[]> {
    return safeInvoke<McpTool[]>('get_mcp_tools', { name });
  },

  // Get resources for an MCP server
  async getResources(name: string): Promise<McpResource[]> {
    return safeInvoke<McpResource[]>('get_mcp_resources', { name });
  },

  // Get logs for an MCP server
  async getLogs(name: string): Promise<McpLogEntry[]> {
    return safeInvoke<McpLogEntry[]>('get_mcp_logs', { name });
  },

  // Get MCP server statistics
  async getStats(): Promise<McpServerStats> {
    return safeInvoke<McpServerStats>('get_mcp_stats');
  },
};
