// Analytics API Service - Tauri Commands

import { safeInvoke, isTauri } from '../lib/tauri';
import { logger } from '../lib/logger';
import type { UsageAnalytics, UsageParams } from '../types';

export interface UsageAnalyticsResult extends UsageAnalytics {
  _isError?: boolean;
}

export const analyticsApi = {
  // 获取使用统计
  getUsage: async (params?: UsageParams): Promise<UsageAnalyticsResult> => {
    try {
      logger.debug('[AnalyticsApi] Calling get_usage_analytics with params:', params);
      const result = await safeInvoke<UsageAnalytics>('get_usage_analytics', params ? { ...params } : undefined);
      logger.debug('[AnalyticsApi] Result:', result);
      return result;
    } catch (error) {
      logger.error('[AnalyticsApi] Failed to get usage analytics:', error);
      // Only return mock data in development/browser environment
      // In production Tauri environment, return error indicator
      if (!isTauri()) {
        logger.warn('[AnalyticsApi] Non-Tauri environment, returning mock data for development');
        return {
          period_days: params?.days ?? 7,
          totals: {
            total_input: 47595106,
            total_output: 1150554,
            total_cache_read: 44084378,
            total_reasoning: 0,
            total_estimated_cost: 0,
            total_actual_cost: 0,
            total_sessions: 168,
          },
          daily: [
            { day: '2026-04-15', sessions: 48, input_tokens: 9914226, output_tokens: 96160, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
            { day: '2026-04-16', sessions: 25, input_tokens: 10329538, output_tokens: 282243, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
            { day: '2026-04-17', sessions: 17, input_tokens: 5533320, output_tokens: 116818, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
            { day: '2026-04-18', sessions: 16, input_tokens: 5093311, output_tokens: 202140, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
            { day: '2026-04-19', sessions: 47, input_tokens: 15093738, output_tokens: 424900, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
            { day: '2026-04-20', sessions: 15, input_tokens: 1630973, output_tokens: 28293, cache_read_tokens: 0, reasoning_tokens: 0, estimated_cost: 0, actual_cost: 0 },
          ],
          by_model: [
            { model: 'astron-code-latest', sessions: 167, input_tokens: 47595106, output_tokens: 1150554, estimated_cost: 0 },
          ],
        };
      }
      // In production, return minimal data with error indicator
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
