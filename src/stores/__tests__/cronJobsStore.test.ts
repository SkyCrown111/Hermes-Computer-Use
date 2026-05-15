// Cron Jobs Store Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useCronJobsStore } from '../cronJobsStore';
import type { CronJob, CronJobOutput } from '../../types/cron';

// Mock the cron jobs API - cronJobsApi.ts uses named exports (export async function ...)
vi.mock('../../services/cronJobsApi', () => ({
  listCronJobs: vi.fn(),
  getCronJob: vi.fn(),
  getCronJobOutputs: vi.fn(),
  createCronJob: vi.fn(),
  updateCronJob: vi.fn(),
  deleteCronJob: vi.fn(),
  toggleCronJob: vi.fn(),
  triggerCronJob: vi.fn(),
}));

import * as cronJobsApi from '../../services/cronJobsApi';

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

// Helper to create valid mock CronJobOutput
const createMockOutput = (overrides: Partial<CronJobOutput> = {}): CronJobOutput => ({
  id: 'o1',
  job_id: '1',
  status: 'completed',
  output: 'Done',
  started_at: '',
  finished_at: '',
  duration_ms: 100,
  ...overrides,
});

describe('CronJobsStore', () => {
  beforeEach(() => {
    useCronJobsStore.setState({
      jobs: [],
      isLoadingJobs: false,
      selectedJob: null,
      isLoadingDetail: false,
      jobOutputs: [],
      isLoadingOutputs: false,
      isEditing: false,
      editingJob: null,
      error: null,
      lastLoadedJobsAt: null,
    });
    vi.clearAllMocks();
  });

  describe('fetchJobs', () => {
    it('should fetch and set jobs', async () => {
      const mockJobs = [createMockJob({ id: '1', name: 'Daily Backup' })];
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue(mockJobs);

      await useCronJobsStore.getState().fetchJobs();

      const state = useCronJobsStore.getState();
      expect(state.jobs).toEqual(mockJobs);
      expect(state.isLoadingJobs).toBe(false);
    });

    it('should set error on fetch failure', async () => {
      vi.mocked(cronJobsApi.listCronJobs).mockRejectedValue(new Error('Network error'));

      await useCronJobsStore.getState().fetchJobs();

      expect(useCronJobsStore.getState().error).toBe('Network error');
    });

    it('should reuse fresh cached jobs', async () => {
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue([]);

      await useCronJobsStore.getState().fetchJobs();
      await useCronJobsStore.getState().fetchJobs();

      expect(cronJobsApi.listCronJobs).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchJobDetail', () => {
    it('should fetch job detail', async () => {
      const mockJob = createMockJob({ id: '1', name: 'Test Job' });
      vi.mocked(cronJobsApi.getCronJob).mockResolvedValue(mockJob);

      await useCronJobsStore.getState().fetchJobDetail('1');

      expect(useCronJobsStore.getState().selectedJob).toEqual(mockJob);
    });
  });

  describe('fetchJobOutputs', () => {
    it('should fetch job outputs', async () => {
      const mockOutputs = [createMockOutput()];
      vi.mocked(cronJobsApi.getCronJobOutputs).mockResolvedValue({ job_id: '1', outputs: mockOutputs });

      await useCronJobsStore.getState().fetchJobOutputs('1', 10);

      expect(useCronJobsStore.getState().jobOutputs).toEqual(mockOutputs);
      expect(cronJobsApi.getCronJobOutputs).toHaveBeenCalledWith('1');
    });

    it('should use default limit', async () => {
      vi.mocked(cronJobsApi.getCronJobOutputs).mockResolvedValue({ job_id: '1', outputs: [] });

      await useCronJobsStore.getState().fetchJobOutputs('1');

      expect(cronJobsApi.getCronJobOutputs).toHaveBeenCalledWith('1');
    });
  });

  describe('createJob', () => {
    it('should create job and add to list', async () => {
      vi.mocked(cronJobsApi.createCronJob).mockResolvedValue({ ok: true });
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue([createMockJob({ id: '1', name: 'New Job', enabled: true })]);

      const result = await useCronJobsStore.getState().createJob({
        name: 'New Job',
        prompt: 'Test prompt',
        schedule: 'every 1h',
      });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('New Job');
      expect(result?.enabled).toBe(true);
      expect(useCronJobsStore.getState().jobs).toHaveLength(1);
    });

    it('should return null on create failure', async () => {
      vi.mocked(cronJobsApi.createCronJob).mockRejectedValue(new Error('Create failed'));

      const result = await useCronJobsStore.getState().createJob({
        name: 'New Job',
        prompt: '',
        schedule: '1h',
      });

      expect(result).toBeNull();
      expect(useCronJobsStore.getState().error).toBe('Create failed');
    });
  });

  describe('updateJob', () => {
    it('should update existing job', async () => {
      useCronJobsStore.setState({
        jobs: [createMockJob({ id: '1', name: 'Old Name' })],
      });

      vi.mocked(cronJobsApi.updateCronJob).mockResolvedValue({ ok: true });
      vi.mocked(cronJobsApi.listCronJobs).mockResolvedValue([createMockJob({ id: '1', name: 'New Name' })]);

      const result = await useCronJobsStore.getState().updateJob('1', { name: 'New Name' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('New Name');
    });

    it('should return null if job not found', async () => {
      const result = await useCronJobsStore.getState().updateJob('nonexistent', { name: 'New' });
      expect(result).toBeNull();
    });
  });

  describe('deleteJob', () => {
    it('should delete job from list', async () => {
      useCronJobsStore.setState({
        jobs: [
          createMockJob({ id: '1', name: 'Job 1' }),
          createMockJob({ id: '2', name: 'Job 2' }),
        ],
      });

      vi.mocked(cronJobsApi.deleteCronJob).mockResolvedValue({ ok: true });

      const result = await useCronJobsStore.getState().deleteJob('1');

      expect(result).toBe(true);
      expect(useCronJobsStore.getState().jobs).toHaveLength(1);
      expect(useCronJobsStore.getState().jobs[0].id).toBe('2');
    });
  });

  describe('pauseJob', () => {
    it('should pause job (set enabled to false)', async () => {
      useCronJobsStore.setState({
        jobs: [createMockJob({ id: '1', enabled: true })],
      });

      vi.mocked(cronJobsApi.toggleCronJob).mockResolvedValue({ ok: true });

      await useCronJobsStore.getState().pauseJob('1');

      expect(useCronJobsStore.getState().jobs[0].enabled).toBe(false);
    });
  });

  describe('resumeJob', () => {
    it('should resume job (set enabled to true)', async () => {
      useCronJobsStore.setState({
        jobs: [createMockJob({ id: '1', enabled: false })],
      });

      vi.mocked(cronJobsApi.toggleCronJob).mockResolvedValue({ ok: true });

      await useCronJobsStore.getState().resumeJob('1');

      expect(useCronJobsStore.getState().jobs[0].enabled).toBe(true);
    });
  });

  describe('triggerJob', () => {
    it('should trigger job manually', async () => {
      vi.mocked(cronJobsApi.triggerCronJob).mockResolvedValue({ id: '1', triggered: true, triggered_at: '' });

      const result = await useCronJobsStore.getState().triggerJob('1');

      expect(result).toBe(true);
    });

    it('should return false on trigger failure', async () => {
      vi.mocked(cronJobsApi.triggerCronJob).mockRejectedValue(new Error('Trigger failed'));

      const result = await useCronJobsStore.getState().triggerJob('1');

      expect(result).toBe(false);
    });
  });

  describe('setEditingJob', () => {
    it('should set editing job', () => {
      const job = createMockJob({ id: '1', name: 'Job' });

      useCronJobsStore.getState().setEditingJob(job);

      const state = useCronJobsStore.getState();
      expect(state.editingJob).toEqual(job);
      expect(state.isEditing).toBe(true);
    });

    it('should clear editing job when null', () => {
      useCronJobsStore.setState({ editingJob: createMockJob(), isEditing: true });

      useCronJobsStore.getState().setEditingJob(null);

      const state = useCronJobsStore.getState();
      expect(state.editingJob).toBeNull();
      expect(state.isEditing).toBe(false);
    });
  });

  describe('clearSelectedJob', () => {
    it('should clear selected job and outputs', () => {
      useCronJobsStore.setState({
        selectedJob: createMockJob(),
        jobOutputs: [createMockOutput()],
      });

      useCronJobsStore.getState().clearSelectedJob();

      const state = useCronJobsStore.getState();
      expect(state.selectedJob).toBeNull();
      expect(state.jobOutputs).toHaveLength(0);
    });
  });

  describe('clearError', () => {
    it('should clear error', () => {
      useCronJobsStore.setState({ error: 'Error' });
      useCronJobsStore.getState().clearError();
      expect(useCronJobsStore.getState().error).toBeNull();
    });
  });
});
