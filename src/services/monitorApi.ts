// Monitor API - 监控日志接口
// 使用 Tauri invoke 调用后端 commands

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
import type { LogsResponse, LogsQueryParams, LogStats, GatewayDetailedStatus, PerformanceMetrics, LogFile } from '../types/monitor';

export const monitorApi = {
  // 获取日志
  getLogs: async (params: LogsQueryParams = {}): Promise<LogsResponse> => {
    try {
      logger.debug('[MonitorAPI] Getting logs with params:', params);
      const response = await safeInvoke<{ file: string; lines: string[] }>('get_logs', {
        file: params.file,
        lines: params.lines,
        level: params.level,
        component: params.component,
        search: params.search,
      });
      logger.debug('[MonitorAPI] Got logs response:', response.file, response.lines.length, 'lines');
      return {
        file: response.file as LogFile,
        lines: response.lines,
      };
    } catch (err) {
      logger.error('[MonitorAPI] Failed to get logs:', err);
      return { file: (params.file || 'agent') as LogFile, lines: [] };
    }
  },

  // 获取日志统计
  getLogStats: async (file: LogFile = 'agent'): Promise<LogStats> => {
    try {
      logger.debug('[MonitorAPI] Getting log stats for:', file);
      const response = await safeInvoke<{
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
      logger.error('[MonitorAPI] Failed to get log stats:', err);
      return {
        total_lines: 0,
        by_level: { DEBUG: 0, INFO: 0, WARNING: 0, ERROR: 0, CRITICAL: 0 },
        by_component: [],
        error_rate: 0,
      };
    }
  },

  // 获取 Gateway 详细状态
  getGatewayStatus: async (): Promise<GatewayDetailedStatus> => {
    try {
      logger.debug('[MonitorAPI] Getting gateway status');
      const response = await safeInvoke<{
        status: string;
        uptime_seconds: number;
        version: string;
        connections: Array<{ platform: string; status: string }>;
        total_messages: number;
        messages_per_minute: number;
      }>('get_gateway_status');
      logger.debug('[MonitorAPI] Gateway status:', response.status);
      return {
        status: ['online', 'running'].includes(response.status) ? 'online' :
                response.status === 'offline' ? 'offline' : 'degraded',
        uptime_seconds: response.uptime_seconds,
        version: response.version,
        connections: response.connections.map(c => ({
          platform: c.platform,
          status: c.status === 'connected' ? 'connected' :
                  c.status === 'disconnected' ? 'disconnected' : 'error',
        })),
        total_messages: response.total_messages,
        messages_per_minute: response.messages_per_minute,
      };
    } catch (err) {
      logger.error('[MonitorAPI] Failed to get gateway status:', err);
      return {
        status: 'offline',
        uptime_seconds: 0,
        version: 'unknown',
        connections: [],
        total_messages: 0,
        messages_per_minute: 0,
      };
    }
  },

  // 获取性能指标
  getPerformanceMetrics: async (minutes: number = 30): Promise<PerformanceMetrics> => {
    try {
      logger.debug('[MonitorAPI] Getting performance metrics');
      const response = await safeInvoke<{
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
      logger.error('[MonitorAPI] Failed to get performance metrics:', err);
      return { cpu: [], memory: [], network_in: [], network_out: [] };
    }
  },

  // 获取可用组件列表
  getComponents: async (): Promise<string[]> => {
    try {
      logger.debug('[MonitorAPI] Getting log components');
      const components = await safeInvoke<string[]>('get_log_components');
      return components;
    } catch (err) {
      logger.error('[MonitorAPI] Failed to get components:', err);
      return [];
    }
  },

  // 清除日志
  clearLogs: async (file: LogFile): Promise<{ ok: boolean }> => {
    try {
      logger.debug('[MonitorAPI] Clearing logs for:', file);
      await safeInvoke<void>('clear_logs', { file });
      return { ok: true };
    } catch (err) {
      logger.error('[MonitorAPI] Failed to clear logs:', err);
      return { ok: false };
    }
  },
};
