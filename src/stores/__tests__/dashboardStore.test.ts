// Dashboard Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDashboardStore } from '../dashboardStore';
import type { SystemStatus, UsageAnalytics, CronJob } from '../../types';

// Mock the services - services/index.ts re-exports as namespace objects
// statusApi and analyticsApi use `export const statusApi = {...}` pattern,
// so when re-exported via `import * as _statusApi` + `export const statusApi = _statusApi`,
// they get an extra nesting level: statusApi.statusApi.getSystemStatus
vi.mock('../../services', () => ({
  analyticsApi: {
    analyticsApi: {
      getUsage: vi.fn(),
    },
  },
  statusApi: {
    statusApi: {
      getSystemStatus: vi.fn(),
    },
  },
  cronJobsApi: {
    listCronJobs: vi.fn(),
  },
  skillsApi: {
    listSkills: vi.fn(),
  },
}));

import { analyticsApi, statusApi, cronJobsApi, skillsApi } from '../../services';

// Helper to create valid mock SystemStatus
const createMockStatus = (overrides: Partial<SystemStatus> = {}): SystemStatus => ({
  gateway: {
    status: 'online',
    version: '1.0.0',
    connected_platforms: [],
    uptime_seconds: 3600,
  },
  metrics: {
    cpu_percent: 25,
    memory_percent: 50,
    memory_used_mb: 512,
    memory_total_mb: 1024,
    disk_percent: 45,
  },
  active_sessions: 5,
  pending_tasks: 2,
  ...overrides,
});

// Helper to create valid mock UsageAnalytics
const createMockAnalytics = (overrides: Partial<UsageAnalytics> = {}): UsageAnalytics => ({
  period_days: 7,
  totals: {
    total_sessions: 100,
    total_input: 50000,
    total_output: 5000,
    total_cache_read: 0,
    total_reasoning: 0,
    total_estimated_cost: 0,
    total_actual_cost: 0,
  },
  daily: [],
  by_model: [],
  ...overrides,
});

// Helper to create valid mock CronJob
const createMockJob = (overrides: Partial<CronJob> = {}): CronJob => ({
  id: '1',
  name: 'Test Job',
  enabled: true,
  schedule: { kind: 'interval', display: '1h' },
  prompt: '',
  created_at: '',
  run_count: 0,
  ...overrides,
});

describe('DashboardStore', () => {
  beforeEach(() => {
    // Reset store state
    useDashboardStore.setState({
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
    });
    vi.clearAllMocks();
  });

  describe('fetchSystemStatus', () => {
    it('should fetch and set system status', async () => {
      const mockStatus = createMockStatus();
      vi.mocked(statusApi.statusApi.getSystemStatus).mockResolvedValue(mockStatus);

      await useDashboardStore.getState().fetchSystemStatus();

      const state = useDashboardStore.getState();
      expect(state.systemStatus).toEqual(mockStatus);
      expect(state.isLoadingStatus).toBe(false);
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(statusApi.statusApi.getSystemStatus).mockRejectedValue(new Error('Network error'));

      await useDashboardStore.getState().fetchSystemStatus();

      const state = useDashboardStore.getState();
      expect(state.error).toContain('Network error');
      expect(state.isLoadingStatus).toBe(false);
    });
  });

  describe('fetchUsageAnalytics', () => {
    it('should fetch and set usage analytics', async () => {
      const mockAnalytics = createMockAnalytics({
        totals: { ...createMockAnalytics().totals, total_sessions: 100 },
      });
      vi.mocked(analyticsApi.analyticsApi.getUsage).mockResolvedValue(mockAnalytics);

      await useDashboardStore.getState().fetchUsageAnalytics(7);

      const state = useDashboardStore.getState();
      expect(state.usageAnalytics).toEqual(mockAnalytics);
      expect(state.recentSessionsCount).toBe(100);
      expect(state.isLoadingAnalytics).toBe(false);
    });

    it('should use default days parameter', async () => {
      vi.mocked(analyticsApi.analyticsApi.getUsage).mockResolvedValue(createMockAnalytics({ period_days: 30 }));

      await useDashboardStore.getState().fetchUsageAnalytics();

      expect(analyticsApi.analyticsApi.getUsage).toHaveBeenCalledWith({ days: 30 });
    });
  });

  describe('fetchSkills', () => {
    it('should fetch and set skills', async () => {
      const mockSkills = [
        { name: 'code_review', path: 'skills/code_review.md', description: 'Code review', enabled: true, category: 'dev', version: '1.0', author: 'system', tags: [] },
      ];
      vi.mocked(skillsApi.listSkills).mockResolvedValue(mockSkills);

      await useDashboardStore.getState().fetchSkills();

      const state = useDashboardStore.getState();
      expect(state.skills).toEqual(mockSkills);
      expect(state.isLoadingSkills).toBe(false);
    });
  });

  describe('fetchTodayTasks', () => {
    it('should filter tasks scheduled for today', async () => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const mockJobs = [
        createMockJob({ id: '1', name: 'Today Task', next_run_at: today.toISOString(), enabled: true }),
        createMockJob({ id: '2', name: 'Tomorrow Task', next_run_at: tomorrow.toISOString(), enabled: true }),
        createMockJob({ id: '3', name: 'Disabled Task', next_run_at: today.toISOString(), enabled: false }),
      ];
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue(mockJobs);

      await useDashboardStore.getState().fetchTodayTasks();

      const state = useDashboardStore.getState();
      expect(state.todayTasks).toHaveLength(1);
      expect(state.todayTasks[0].name).toBe('Today Task');
    });

    it('should include tasks created today that have not run yet', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const mockJobs = [
        createMockJob({
          id: 'created-today',
          name: 'Created Today',
          created_at: now.toISOString(),
          next_run_at: undefined,
          last_run_at: undefined,
          run_count: 0,
          enabled: true,
        }),
        createMockJob({
          id: 'old-job',
          name: 'Old Job',
          created_at: yesterday.toISOString(),
          next_run_at: undefined,
          last_run_at: undefined,
          run_count: 0,
          enabled: true,
        }),
      ];

      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue(mockJobs);

      await useDashboardStore.getState().fetchTodayTasks();

      const state = useDashboardStore.getState();
      expect(state.todayTasks).toHaveLength(1);
      expect(state.todayTasks[0].name).toBe('Created Today');
    });

    it('should include overdue enabled tasks that still have not run today', async () => {
      const now = new Date();
      const overdue = new Date(now);
      overdue.setDate(overdue.getDate() - 7);
      const ranToday = new Date(now);
      ranToday.setHours(8, 0, 0, 0);

      const mockJobs = [
        createMockJob({
          id: 'overdue-job',
          name: 'Overdue Job',
          created_at: overdue.toISOString(),
          next_run_at: overdue.toISOString(),
          last_run_at: undefined,
          run_count: 3,
          enabled: true,
        }),
        createMockJob({
          id: 'already-ran-today',
          name: 'Already Ran Today',
          created_at: overdue.toISOString(),
          next_run_at: overdue.toISOString(),
          last_run_at: ranToday.toISOString(),
          run_count: 4,
          enabled: true,
        }),
      ];

      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue(mockJobs);

      await useDashboardStore.getState().fetchTodayTasks();

      const state = useDashboardStore.getState();
      expect(state.todayTasks).toHaveLength(1);
      expect(state.todayTasks[0].name).toBe('Overdue Job');
    });
  });

  describe('today pending job logic', () => {
    it('should match cron jobs page pending count logic', async () => {
      const now = new Date();
      const laterToday = new Date(now);
      laterToday.setHours(21, 0, 0, 0);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);

      const mockJobs = [
        createMockJob({ id: 'today', name: 'Today Task', enabled: true, next_run_at: laterToday.toISOString() }),
        createMockJob({ id: 'tomorrow', name: 'Tomorrow Task', enabled: true, next_run_at: tomorrow.toISOString() }),
      ];

      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue(mockJobs);

      await useDashboardStore.getState().fetchTodayTasks();

      expect(useDashboardStore.getState().todayTasks).toHaveLength(1);
      expect(useDashboardStore.getState().todayTasks[0].id).toBe('today');
    });
  });

  describe('fetchAll', () => {
    it('should fetch all dashboard data in parallel', async () => {
      vi.mocked(statusApi.statusApi.getSystemStatus).mockResolvedValue(createMockStatus());
      vi.mocked(analyticsApi.analyticsApi.getUsage).mockResolvedValue(createMockAnalytics());
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue([]);

      await useDashboardStore.getState().fetchAll();

      expect(statusApi.statusApi.getSystemStatus).toHaveBeenCalled();
      expect(analyticsApi.analyticsApi.getUsage).toHaveBeenCalled();
      expect(skillsApi.listSkills).toHaveBeenCalled();
      expect(cronJobsApi.listCronJobs).toHaveBeenCalled();
    });

    it('should skip system status when requested', async () => {
      vi.mocked(analyticsApi.analyticsApi.getUsage).mockResolvedValue(createMockAnalytics());
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue([]);

      await useDashboardStore.getState().fetchAll(false);

      expect(statusApi.statusApi.getSystemStatus).not.toHaveBeenCalled();
      expect(analyticsApi.analyticsApi.getUsage).toHaveBeenCalled();
      expect(skillsApi.listSkills).toHaveBeenCalled();
      expect(cronJobsApi.listCronJobs).toHaveBeenCalled();
    });

    it('should reuse fresh cached dashboard data', async () => {
      vi.mocked(analyticsApi.analyticsApi.getUsage).mockResolvedValue(createMockAnalytics());
      vi.mocked(skillsApi.listSkills).mockResolvedValue([]);
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue([]);

      await useDashboardStore.getState().fetchAll(false);
      await useDashboardStore.getState().fetchAll(false);

      expect(analyticsApi.analyticsApi.getUsage).toHaveBeenCalledTimes(1);
      expect(skillsApi.listSkills).toHaveBeenCalledTimes(1);
      expect(cronJobsApi.listCronJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useDashboardStore.setState({ error: 'Some error' });
      useDashboardStore.getState().clearError();
      expect(useDashboardStore.getState().error).toBeNull();
    });
  });
});
