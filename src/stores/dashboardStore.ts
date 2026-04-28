// Dashboard Store - 仪表盘状态管理

import { create } from 'zustand';
import type { UsageAnalytics, SystemStatus, CronJob, Skill } from '../types';
import { analyticsApi as _analyticsApi, statusApi as _statusApi, cronJobsApi, skillsApi } from '../services';
import { t } from '../lib/i18n';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';
import { useThemeStore } from './themeStore';

// statusApi and analyticsApi are re-exported as namespace objects from services/index.ts
// The actual API objects are nested: _statusApi.statusApi, _analyticsApi.analyticsApi
const statusApi: typeof _statusApi.statusApi = _statusApi.statusApi;
const analyticsApi: typeof _analyticsApi.analyticsApi = _analyticsApi.analyticsApi;

interface DashboardState {
  // 系统状态
  systemStatus: SystemStatus | null;
  isLoadingStatus: boolean;
  
  // 使用统计
  usageAnalytics: UsageAnalytics | null;
  isLoadingAnalytics: boolean;
  
  // 最近会话
  recentSessionsCount: number;
  
  // Skills
  skills: Skill[];
  isLoadingSkills: boolean;
  
  // 今日任务
  todayTasks: CronJob[];
  isLoadingTasks: boolean;
  
  // 错误
  error: string | null;
  
  // Actions
  fetchSystemStatus: () => Promise<void>;
  fetchUsageAnalytics: (days?: number) => Promise<void>;
  fetchSkills: () => Promise<void>;
  fetchTodayTasks: () => Promise<void>;
  fetchAll: () => Promise<void>;
  clearError: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // 初始状态
  systemStatus: null,
  isLoadingStatus: false,
  usageAnalytics: null,
  isLoadingAnalytics: false,
  recentSessionsCount: 0,
  skills: [],
  isLoadingSkills: false,
  todayTasks: [],
  isLoadingTasks: false,
  error: null,

  // 获取系统状态
  fetchSystemStatus: async () => {
    set({ isLoadingStatus: true, error: null });
    try {
      logger.debug('[Dashboard] Fetching system status...');
      const status = await statusApi.getSystemStatus();
      logger.debug('[Dashboard] System status fetched:', status);
      set({ systemStatus: status, isLoadingStatus: false });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch system status:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchSystemStatus', lang)}: ${getErrorMessage(err)}`,
        isLoadingStatus: false
      });
    }
  },

  // 获取使用统计
  fetchUsageAnalytics: async (days = 30) => {
    set({ isLoadingAnalytics: true, error: null });
    try {
      logger.debug('[Dashboard] Fetching usage analytics...');
      const analytics = await analyticsApi.getUsage({ days });
      logger.debug('[Dashboard] Usage analytics fetched:', analytics);
      logger.debug('[Dashboard] Total sessions:', analytics.totals.total_sessions);
      logger.debug('[Dashboard] Daily data:', analytics.daily);
      set({
        usageAnalytics: analytics,
        recentSessionsCount: analytics.totals.total_sessions,
        isLoadingAnalytics: false,
      });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch usage analytics:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchUsageAnalytics', lang)}: ${getErrorMessage(err)}`,
        isLoadingAnalytics: false
      });
    }
  },

  // 获取 Skills 列表
  fetchSkills: async () => {
    set({ isLoadingSkills: true, error: null });
    try {
      logger.debug('[Dashboard] Fetching skills...');
      const skills = await skillsApi.listSkills();
      logger.debug('[Dashboard] Skills fetched:', skills);
      set({ skills, isLoadingSkills: false });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch skills:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchSkills', lang)}: ${getErrorMessage(err)}`,
        isLoadingSkills: false
      });
    }
  },

  // 获取今日任务
  fetchTodayTasks: async () => {
    set({ isLoadingTasks: true, error: null });
    try {
      logger.debug('[Dashboard] Fetching today tasks...');
      const jobs = await cronJobsApi.listCronJobs();
      // 过滤出今日要执行的任务
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayJobs = jobs.filter((job) => {
        if (!job.next_run_at) return false;
        const nextRun = new Date(job.next_run_at);
        return nextRun >= today && nextRun < tomorrow && job.enabled;
      });

      logger.debug('[Dashboard] Today tasks fetched:', todayJobs);
      set({ todayTasks: todayJobs, isLoadingTasks: false });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch today tasks:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchTodayTasks', lang)}: ${getErrorMessage(err)}`,
        isLoadingTasks: false
      });
    }
  },

  // 获取所有数据
  fetchAll: async () => {
    logger.debug('[Dashboard] Fetching all dashboard data...');
    set({ error: null });
    await Promise.all([
      useDashboardStore.getState().fetchSystemStatus(),
      useDashboardStore.getState().fetchUsageAnalytics(),
      useDashboardStore.getState().fetchSkills(),
      useDashboardStore.getState().fetchTodayTasks(),
    ]);
    logger.debug('[Dashboard] All dashboard data fetched');
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
