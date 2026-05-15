import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import type { UsageAnalytics, UsageParams } from '../types/analytics';

export interface UsageAnalyticsResult extends UsageAnalytics {
  _isError?: boolean;
}

export const analyticsApi = {
  getUsage: async (params?: UsageParams): Promise<UsageAnalyticsResult> => {
    try {
      return await apiClient.invokeShared<UsageAnalytics>('get_usage_analytics', params ? { ...params } : undefined);
    } catch (error) {
      logger.error('[AnalyticsApi] getUsage failed:', getErrorDetail(error));
      return {
        period_days: params?.days ?? 7,
        totals: {
          total_input: 0,
          total_output: 0,
          total_cache_read: 0,
          total_reasoning: 0,
          total_estimated_cost: 0,
          total_actual_cost: 0,
          total_sessions: 0,
        },
        daily: [],
        by_model: [],
        _isError: true,
      };
    }
  },
};
