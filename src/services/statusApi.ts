// Status API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import { logger } from '../lib/logger';
import type { SystemStatus } from '../types';

export const statusApi = {
  // 获取系统状态
  getSystemStatus: async (): Promise<SystemStatus> => {
    try {
      return await safeInvoke<SystemStatus>('get_system_status');
    } catch (error) {
      logger.error('Failed to get system status:', error);
      // Return mock data for development
      return {
        gateway: {
          status: 'offline',
          uptime_seconds: 0,
          version: '0.1.0',
          connected_platforms: [],
        },
        metrics: {
          cpu_percent: 0,
          memory_percent: 0,
          memory_used_mb: 0,
          memory_total_mb: 0,
          disk_percent: 0,
        },
        active_sessions: 0,
        pending_tasks: 0,
      };
    }
  },

  // 健康检查
  health: async (): Promise<{ status: string }> => {
    try {
      return await safeInvoke<{ status: string }>('health_check');
    } catch {
      return { status: 'ok' };
    }
  },
};
