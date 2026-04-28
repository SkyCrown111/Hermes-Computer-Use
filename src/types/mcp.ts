// MCP (Model Context Protocol) 类型定义

// MCP 服务器状态
export type McpServerStatus = 'connected' | 'disconnected' | 'error' | 'starting';

// MCP 服务器配置
export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  auto_start?: boolean;
  restart_on_failure?: boolean;
  max_restarts?: number;
}

// MCP 服务器信息
export interface McpServer {
  name: string;
  status: McpServerStatus;
  config: McpServerConfig;
  uptime_seconds?: number;
  tools_count?: number;
  resources_count?: number;
  last_error?: string;
  last_activity?: string;
  request_count?: number;
  error_count?: number;
}

// MCP 工具定义
export interface McpTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  server_name: string;
}

// MCP 资源定义
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mime_type?: string;
  server_name: string;
}

// MCP 服务器统计
export interface McpServerStats {
  total_servers: number;
  connected: number;
  disconnected: number;
  error: number;
  total_tools: number;
  total_resources: number;
  total_requests: number;
  total_errors: number;
}

// 添加 MCP 服务器请求
export interface AddMcpServerRequest {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  auto_start?: boolean;
}

// 更新 MCP 服务器请求
export interface UpdateMcpServerRequest {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  auto_start?: boolean;
}

// MCP 连接测试结果
export interface McpConnectionTestResult {
  success: boolean;
  message: string;
  tools?: McpTool[];
  resources?: McpResource[];
  error?: string;
}

// MCP 日志条目
export interface McpLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  server_name: string;
  message: string;
}
