import { create } from 'zustand';
import type { UsageAnalytics, SystemStatus, CronJob, Skill } from '../types';
import { analyticsApi as analyticsNamespace, statusApi as statusNamespace, cronJobsApi, skillsApi } from '../services';
import { t } from '../lib/i18n';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/errorUtils';
import { getTodayPendingCronJobs } from '../lib/cronJobs';
import { useThemeStore } from './themeStore';

const statusApi: typeof statusNamespace.statusApi = statusNamespace.statusApi;
const analyticsApi: typeof analyticsNamespace.analyticsApi = analyticsNamespace.analyticsApi;

const STATUS_FRESHNESS_MS = 30_000;
const ANALYTICS_FRESHNESS_MS = 60_000;
const SKILLS_FRESHNESS_MS = 5 * 60_000;
const TASKS_FRESHNESS_MS = 60_000;

function isFresh(lastLoadedAt: number | null, freshnessMs: number, force = false): boolean {
  return !force && lastLoadedAt !== null && Date.now() - lastLoadedAt < freshnessMs;
}

interface DashboardState {
  systemStatus: SystemStatus | null;
  isLoadingStatus: boolean;
  usageAnalytics: UsageAnalytics | null;
  isLoadingAnalytics: boolean;
  recentSessionsCount: number;
  skills: Skill[];
  isLoadingSkills: boolean;
  todayTasks: CronJob[];
  isLoadingTasks: boolean;
  error: string | null;
  lastLoadedStatusAt: number | null;
  lastLoadedAnalyticsAt: number | null;
  lastLoadedSkillsAt: number | null;
  lastLoadedTasksAt: number | null;
  fetchSystemStatus: (force?: boolean) => Promise<void>;
  fetchUsageAnalytics: (days?: number, force?: boolean) => Promise<void>;
  fetchSkills: (force?: boolean) => Promise<void>;
  fetchTodayTasks: (force?: boolean) => Promise<void>;
  fetchAll: (includeSystemStatus?: boolean, force?: boolean) => Promise<void>;
  clearError: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
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
  lastLoadedStatusAt: null,
  lastLoadedAnalyticsAt: null,
  lastLoadedSkillsAt: null,
  lastLoadedTasksAt: null,

  fetchSystemStatus: async (force = false) => {
    if (isFresh(useDashboardStore.getState().lastLoadedStatusAt, STATUS_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingStatus: true, error: null });
    try {
      const status = await statusApi.getSystemStatus();
      set({ systemStatus: status, isLoadingStatus: false, lastLoadedStatusAt: Date.now() });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch system status:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchSystemStatus', lang)}: ${getErrorMessage(err)}`,
        isLoadingStatus: false,
      });
    }
  },

  fetchUsageAnalytics: async (days = 30, force = false) => {
    if (isFresh(useDashboardStore.getState().lastLoadedAnalyticsAt, ANALYTICS_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingAnalytics: true, error: null });
    try {
      const analytics = await analyticsApi.getUsage({ days });
      set({
        usageAnalytics: analytics,
        recentSessionsCount: analytics.totals.total_sessions,
        isLoadingAnalytics: false,
        lastLoadedAnalyticsAt: Date.now(),
      });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch usage analytics:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchUsageAnalytics', lang)}: ${getErrorMessage(err)}`,
        isLoadingAnalytics: false,
      });
    }
  },

  fetchSkills: async (force = false) => {
    if (isFresh(useDashboardStore.getState().lastLoadedSkillsAt, SKILLS_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingSkills: true, error: null });
    try {
      const skills = await skillsApi.listSkills();
      set({ skills, isLoadingSkills: false, lastLoadedSkillsAt: Date.now() });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch skills:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchSkills', lang)}: ${getErrorMessage(err)}`,
        isLoadingSkills: false,
      });
    }
  },

  fetchTodayTasks: async (force = false) => {
    if (isFresh(useDashboardStore.getState().lastLoadedTasksAt, TASKS_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingTasks: true, error: null });
    try {
      const jobs = await cronJobsApi.listCronJobs();
      const todayJobs = getTodayPendingCronJobs(jobs);

      set({ todayTasks: todayJobs, isLoadingTasks: false, lastLoadedTasksAt: Date.now() });
    } catch (err) {
      logger.error('[Dashboard] Failed to fetch today tasks:', err);
      const lang = useThemeStore.getState().language;
      set({
        error: `${t('error.fetchTodayTasks', lang)}: ${getErrorMessage(err)}`,
        isLoadingTasks: false,
      });
    }
  },

  fetchAll: async (includeSystemStatus = true, force = false) => {
    set({ error: null });
    const tasks: Array<Promise<void>> = [
      useDashboardStore.getState().fetchUsageAnalytics(30, force),
      useDashboardStore.getState().fetchSkills(force),
      useDashboardStore.getState().fetchTodayTasks(force),
    ];

    if (includeSystemStatus) {
      tasks.unshift(useDashboardStore.getState().fetchSystemStatus(force));
    }

    await Promise.all(tasks);
  },

  clearError: () => {
    set({ error: null });
  },
}));
