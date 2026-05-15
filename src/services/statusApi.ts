import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { SystemStatus, HealthCheckResult, ReadinessStatusSnapshot } from '../types/status';

export const statusApi = {
  getSystemStatus: async (): Promise<SystemStatus> => {
    try {
      return await apiClient.invokeShared<SystemStatus>('get_system_status');
    } catch (error) {
      logger.error('[StatusApi] getSystemStatus failed:', getErrorDetail(error));
      return {
        gateway: { status: 'offline', uptime_seconds: 0, version: '0.1.0', connected_platforms: [] },
        metrics: { cpu_percent: 0, memory_percent: 0, memory_used_mb: 0, memory_total_mb: 0, disk_percent: 0 },
        active_sessions: 0,
        pending_tasks: 0,
      };
    }
  },

  health: async (): Promise<HealthCheckResult> => {
    try {
      return await apiClient.invokeShared<HealthCheckResult>('health_check');
    } catch (error) {
      logger.error('[StatusApi] health check failed:', getErrorDetail(error));
      return { status: 'error', source: 'unknown' };
    }
  },

  getReadinessStatus: async (): Promise<ReadinessStatusSnapshot> => {
    try {
      return await apiClient.invokeShared<ReadinessStatusSnapshot>('get_readiness_status');
    } catch (error) {
      logger.error('[StatusApi] getReadinessStatus failed:', getErrorDetail(error));
      return {
        health: { status: 'error', source: 'unknown' },
        system_status: {
          gateway: { status: 'offline', uptime_seconds: 0, version: '0.1.0', connected_platforms: [] },
          metrics: { cpu_percent: 0, memory_percent: 0, memory_used_mb: 0, memory_total_mb: 0, disk_percent: 0 },
          active_sessions: 0,
          pending_tasks: 0,
        },
      };
    }
  },
};
