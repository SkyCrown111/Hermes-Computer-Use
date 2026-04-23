// Monitor 监控日志类型定义

// 日志级别
export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

// 日志文件类型
export type LogFile = 'agent' | 'gateway' | 'cron' | 'mcp';

// 日志行
export interface LogLine {
  raw: string;
  timestamp?: string;
  level?: LogLevel;
  component?: string;
  message?: string;
}

// 日志查询参数
export interface LogsQueryParams {
  file?: LogFile;
  lines?: number;
  level?: LogLevel;
  component?: string;
  search?: string;
}

// 日志响应
export interface LogsResponse {
  file: LogFile;
  lines: string[];
}

// 性能指标数据点
export interface MetricDataPoint {
  timestamp: string;
  value: number;
}

// 性能指标
export interface PerformanceMetrics {
  cpu: MetricDataPoint[];
  memory: MetricDataPoint[];
  network_in: MetricDataPoint[];
  network_out: MetricDataPoint[];
}

// Gateway 连接状态
export interface GatewayConnection {
  platform: string;
  status: 'connected' | 'disconnected' | 'error';
  last_activity?: string;
  message_count?: number;
}

// Gateway 详细状态
export interface GatewayDetailedStatus {
  status: 'online' | 'offline' | 'degraded';
  uptime_seconds: number;
  version: string;
  connections: GatewayConnection[];
  total_messages: number;
  messages_per_minute: number;
}

// 组件统计
export interface ComponentStats {
  name: string;
  count: number;
  error_count: number;
  last_activity: string;
}

// 日志统计
export interface LogStats {
  total_lines: number;
  by_level: Record<LogLevel, number>;
  by_component: ComponentStats[];
  error_rate: number;
}
