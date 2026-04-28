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

// Error statistics
export interface ErrorStats {
  total_errors: number;
  by_type: Record<string, number>;
  last_hour: number;
  last_24h: number;
}

// Connection event
export interface ConnectionEvent {
  timestamp: string;
  event_type: 'connect' | 'disconnect' | 'error' | 'unknown';
  platform: string;
  message?: string;
}

// Throughput statistics
export interface ThroughputStats {
  requests_per_second: number;
  bytes_per_second: number;
  peak_requests_per_second: number;
  peak_bytes_per_second: number;
}

// Gateway 详细状态
export interface GatewayDetailedStatus {
  status: 'online' | 'offline' | 'degraded';
  uptime_seconds: number;
  version: string;
  connections: GatewayConnection[];
  total_messages: number;
  messages_per_minute: number;
  // Advanced metrics
  active_requests: number;
  queue_depth: number;
  avg_response_time_ms: number;
  memory_usage_mb: number;
  cpu_usage_percent: number;
  error_stats: ErrorStats;
  connection_history: ConnectionEvent[];
  throughput: ThroughputStats;
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
