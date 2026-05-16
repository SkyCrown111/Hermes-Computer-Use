/**
 * Tools API - Direct tool invocation
 */
import { isTauri } from '../lib/tauri';
import { isToolDirectInvocable } from '../lib/ipcToolPolicy';
import { apiClient } from './apiClient';
import { logger } from '../lib/logger';

// Tool information
export interface ToolInfo {
  name: string;
  toolset: string;
  description?: string;
  emoji?: string;
  is_async: boolean;
}

// Tool execution result
export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  duration_ms?: number;
}

// Toolset info
export interface ToolsetInfo {
  name: string;
  description: string;
  tools: string[];
  includes: string[];
}

/**
 * List all available tools from Hermes Agent
 */
export async function listAvailableTools(): Promise<ToolInfo[]> {
  if (!isTauri()) {
    logger.warn('[ToolsApi] Not in Tauri environment, returning mock tools');
    return [
      { name: 'web_search', toolset: 'web', description: 'Search the web', emoji: '🔍', is_async: false },
      { name: 'terminal', toolset: 'terminal', description: 'Execute terminal commands', emoji: '💻', is_async: false },
      { name: 'read_file', toolset: 'file', description: 'Read file contents', emoji: '📄', is_async: false },
    ];
  }

  const tools = await apiClient.invoke<ToolInfo[]>('list_available_tools');
  return tools.filter((t) => isToolDirectInvocable(t.name));
}

/**
 * Get schema for a specific tool
 */
export async function getToolSchema(toolName: string): Promise<Record<string, unknown>> {
  if (!isTauri()) {
    return { schema: {}, description: 'Mock schema' };
  }

  return apiClient.invoke<Record<string, unknown>>('get_tool_schema', { tool_name: toolName });
}

/**
 * Invoke a tool directly
 */
export async function invokeTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string
): Promise<ToolResult> {
  if (!isTauri()) {
    logger.warn('[ToolsApi] Not in Tauri environment, returning mock result');
    return {
      success: true,
      output: `[Mock] Tool ${toolName} executed with args: ${JSON.stringify(args)}`,
      duration_ms: 100,
    };
  }

  return apiClient.invoke<ToolResult>('invoke_tool', {
    tool_name: toolName,
    args,
    session_id: sessionId ?? null,
  });
}

/**
 * List all available toolsets
 */
export async function listToolsets(): Promise<ToolsetInfo[]> {
  if (!isTauri()) {
    return [
      { name: 'web', description: 'Web research tools', tools: ['web_search', 'web_extract'], includes: [] },
      { name: 'terminal', description: 'Terminal commands', tools: ['terminal', 'process'], includes: [] },
      { name: 'file', description: 'File operations', tools: ['read_file', 'write_file', 'patch', 'search_files'], includes: [] },
    ];
  }

  return apiClient.invoke<ToolsetInfo[]>('list_toolsets');
}
