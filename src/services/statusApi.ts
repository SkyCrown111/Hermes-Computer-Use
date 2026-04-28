import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { SystemStatus } from '../types/status';

export const statusApi = {
  getSystemStatus: async (): Promise<SystemStatus> => {
    try {
      return await apiClient.invoke<SystemStatus>('get_system_status');
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

  health: async (): Promise<{ status: string }> => {
    try {
      return await apiClient.invoke<{ status: string }>('health_check');
    } catch (error) {
      logger.error('[StatusApi] health check failed:', getErrorDetail(error));
      return { status: 'error' };
    }
  },
};
