import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { LogsResponse, LogsQueryParams, LogStats, GatewayDetailedStatus, PerformanceMetrics, LogFile, ErrorStats, ConnectionEvent, ThroughputStats, LogLevel } from '../types/monitor';

const LOG_FILE_PATHS: Record<LogFile, string> = {
  agent: '~/.hermes/logs/agent.log',
  gateway: '~/.hermes/logs/gateway.log',
  cron: '~/.hermes/logs/cron.log',
  mcp: '~/.hermes/logs/mcp.log',
};

export interface LogStreamFilter {
  level?: LogLevel;
  module?: string;
  keyword?: string;
}

const defaultErrorStats: ErrorStats = {
  total_errors: 0,
  by_type: {},
  last_hour: 0,
  last_24h: 0,
};

const defaultConnectionHistory: ConnectionEvent[] = [];

const defaultThroughput: ThroughputStats = {
  requests_per_second: 0,
  bytes_per_second: 0,
  peak_requests_per_second: 0,
  peak_bytes_per_second: 0,
};

const defaultGatewayStatus: GatewayDetailedStatus = {
  status: 'offline',
  uptime_seconds: 0,
  version: 'unknown',
  connections: [],
  total_messages: 0,
  messages_per_minute: 0,
  active_requests: 0,
  queue_depth: 0,
  avg_response_time_ms: 0,
  memory_usage_mb: 0,
  cpu_usage_percent: 0,
  error_stats: defaultErrorStats,
  connection_history: defaultConnectionHistory,
  throughput: defaultThroughput,
};

export const monitorApi = {
  getLogs: async (params: LogsQueryParams = {}): Promise<LogsResponse> => {
    try {
      const response = await apiClient.invoke<{ file: string; lines: string[] }>('get_logs', {
        file: params.file,
        lines: params.lines,
        level: params.level,
        component: params.component,
        search: params.search,
      });
      return { file: response.file as LogFile, lines: response.lines };
    } catch (err) {
      logger.error('[MonitorApi] getLogs failed:', getErrorDetail(err));
      return { file: (params.file || 'agent') as LogFile, lines: [] };
    }
  },

  getLogStats: async (file: LogFile = 'agent'): Promise<LogStats> => {
    try {
      const response = await apiClient.invoke<{
        total_lines: number;
        by_level: Record<string, number>;
        by_component: Array<{ name: string; count: number }>;
        error_rate: number;
      }>('get_log_stats', { file });
      return {
        total_lines: response.total_lines,
        by_level: response.by_level as LogStats['by_level'],
        by_component: response.by_component.map(c => ({
          name: c.name,
          count: c.count,
          error_count: 0,
          last_activity: '',
        })),
        error_rate: response.error_rate,
      };
    } catch (err) {
      logger.error('[MonitorApi] getLogStats failed:', getErrorDetail(err));
      return { total_lines: 0, by_level: { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 }, by_component: [], error_rate: 0 };
    }
  },

  getGatewayStatus: async (): Promise<GatewayDetailedStatus> => {
    try {
      const response = await apiClient.invoke<{
        status: string;
        uptime_seconds: number;
        version: string;
        connections: Array<{ platform: string; status: string }>;
        total_messages: number;
        messages_per_minute: number;
        active_requests: number;
        queue_depth: number;
        avg_response_time_ms: number;
        memory_usage_mb: number;
        cpu_usage_percent: number;
        error_stats: ErrorStats;
        connection_history: Array<{ timestamp: string; event_type: string; platform: string; message?: string }>;
        throughput: ThroughputStats;
      }>('get_gateway_status');
      return {
        status: ['online', 'running'].includes(response.status) ? 'online' : response.status === 'offline' ? 'offline' : 'degraded',
        uptime_seconds: response.uptime_seconds,
        version: response.version,
        connections: response.connections.map(c => ({
          platform: c.platform,
          status: c.status === 'connected' ? 'connected' : c.status === 'disconnected' ? 'disconnected' : 'error',
        })),
        total_messages: response.total_messages,
        messages_per_minute: response.messages_per_minute,
        active_requests: response.active_requests ?? 0,
        queue_depth: response.queue_depth ?? 0,
        avg_response_time_ms: response.avg_response_time_ms ?? 0,
        memory_usage_mb: response.memory_usage_mb ?? 0,
        cpu_usage_percent: response.cpu_usage_percent ?? 0,
        error_stats: response.error_stats ?? defaultErrorStats,
        connection_history: (response.connection_history ?? []).map(e => ({
          timestamp: e.timestamp,
          event_type: e.event_type as ConnectionEvent['event_type'],
          platform: e.platform,
          message: e.message,
        })),
        throughput: response.throughput ?? defaultThroughput,
      };
    } catch (err) {
      logger.error('[MonitorApi] getGatewayStatus failed:', getErrorDetail(err));
      return defaultGatewayStatus;
    }
  },

  getPerformanceMetrics: async (minutes: number = 30): Promise<PerformanceMetrics> => {
    try {
      const response = await apiClient.invoke<{
        cpu: Array<{ timestamp: number; value: number }>;
        memory: Array<{ timestamp: number; value: number }>;
        network_in: Array<{ timestamp: number; value: number }>;
        network_out: Array<{ timestamp: number; value: number }>;
      }>('get_performance_metrics', { minutes });
      return {
        cpu: response.cpu.map(p => ({ timestamp: String(p.timestamp), value: p.value })),
        memory: response.memory.map(p => ({ timestamp: String(p.timestamp), value: p.value })),
        network_in: response.network_in.map(p => ({ timestamp: String(p.timestamp), value: p.value })),
        network_out: response.network_out.map(p => ({ timestamp: String(p.timestamp), value: p.value })),
      };
    } catch (err) {
      logger.error('[MonitorApi] getPerformanceMetrics failed:', getErrorDetail(err));
      return { cpu: [], memory: [], network_in: [], network_out: [] };
    }
  },

  getComponents: async (): Promise<string[]> => {
    try {
      return await apiClient.invoke<string[]>('get_log_components');
    } catch (err) {
      logger.error('[MonitorApi] getComponents failed:', getErrorDetail(err));
      return [];
    }
  },

  clearLogs: async (file: LogFile): Promise<{ ok: boolean }> => {
    try {
      await apiClient.invoke<void>('clear_logs', { file });
      return { ok: true };
    } catch (err) {
      logger.error('[MonitorApi] clearLogs failed:', getErrorDetail(err));
      return { ok: false };
    }
  },

  reloadGatewayConfig: async (): Promise<{ ok: boolean }> => {
    try {
      await apiClient.invoke<void>('reload_gateway_config');
      return { ok: true };
    } catch (err) {
      logger.error('[MonitorApi] reloadGatewayConfig failed:', getErrorDetail(err));
      throw err;
    }
  },

  startLogStream: async (file: LogFile = 'agent', filter?: LogStreamFilter): Promise<string> => {
    return apiClient.invoke<string>('start_log_stream', {
      log_path: LOG_FILE_PATHS[file],
      filter: filter
        ? {
            level: filter.level ?? null,
            module: filter.module ?? null,
            keyword: filter.keyword ?? null,
          }
        : null,
    });
  },

  stopLogStream: async (streamId: string): Promise<void> => {
    await apiClient.invoke<void>('stop_log_stream', { stream_id: streamId });
  },

  exportLogsContent: async (
    file: LogFile = 'agent',
    filter?: LogStreamFilter,
  ): Promise<{ content: string; line_count: number }> => {
    return apiClient.invoke<{ content: string; line_count: number }>('export_logs_content', {
      log_path: LOG_FILE_PATHS[file],
      filter: filter
        ? {
            level: filter.level ?? null,
            module: filter.module ?? null,
            keyword: filter.keyword ?? null,
          }
        : null,
    });
  },
};
