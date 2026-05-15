import { create } from 'zustand';
import type { CronJob, CronJobOutput } from '../types/cron';
import * as cronJobsApi from '../services/cronJobsApi';
import { getErrorMessage } from '../lib/errorUtils';

const JOBS_FRESHNESS_MS = 60_000;

function isFresh(lastLoadedAt: number | null, freshnessMs: number, force = false): boolean {
  return !force && lastLoadedAt !== null && Date.now() - lastLoadedAt < freshnessMs;
}

export interface CreateCronJobParams {
  name: string;
  prompt: string;
  schedule: string;
  skills?: string[];
  deliver?: string;
}

interface CronJobsState {
  jobs: CronJob[];
  isLoadingJobs: boolean;
  selectedJob: CronJob | null;
  isLoadingDetail: boolean;
  jobOutputs: CronJobOutput[];
  isLoadingOutputs: boolean;
  isEditing: boolean;
  editingJob: CronJob | null;
  error: string | null;
  lastLoadedJobsAt: number | null;
  fetchJobs: (force?: boolean) => Promise<void>;
  fetchJobDetail: (jobId: string) => Promise<void>;
  fetchJobOutputs: (jobId: string, limit?: number) => Promise<void>;
  createJob: (params: CreateCronJobParams) => Promise<CronJob | null>;
  updateJob: (jobId: string, updates: Partial<CreateCronJobParams>) => Promise<CronJob | null>;
  deleteJob: (jobId: string) => Promise<boolean>;
  pauseJob: (jobId: string) => Promise<void>;
  resumeJob: (jobId: string) => Promise<void>;
  triggerJob: (jobId: string) => Promise<boolean>;
  setEditingJob: (job: CronJob | null) => void;
  clearSelectedJob: () => void;
  clearError: () => void;
}

export const useCronJobsStore = create<CronJobsState>((set, get) => ({
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

  fetchJobs: async (force = false) => {
    if (isFresh(get().lastLoadedJobsAt, JOBS_FRESHNESS_MS, force)) {
      return;
    }

    set({ isLoadingJobs: true, error: null });
    try {
      const jobs = await cronJobsApi.listCronJobs();
      set({ jobs, isLoadingJobs: false, lastLoadedJobsAt: Date.now() });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingJobs: false });
    }
  },

  fetchJobDetail: async (jobId: string) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const job = await cronJobsApi.getCronJob(jobId);
      set({ selectedJob: job ?? null, isLoadingDetail: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingDetail: false });
    }
  },

  fetchJobOutputs: async (jobId: string, _limit = 10) => {
    set({ isLoadingOutputs: true });
    try {
      const response = await cronJobsApi.getCronJobOutputs(jobId);
      set({ jobOutputs: response.outputs || [], isLoadingOutputs: false });
    } catch (err) {
      set({ error: getErrorMessage(err), isLoadingOutputs: false });
    }
  },

  createJob: async (params: CreateCronJobParams) => {
    set({ error: null });
    try {
      await cronJobsApi.createCronJob(params);
      await get().fetchJobs(true);
      return get().jobs.find((job) => job.name === params.name) || null;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  updateJob: async (jobId: string, updates: Partial<CreateCronJobParams>) => {
    set({ error: null });
    try {
      await cronJobsApi.updateCronJob(jobId, { updates });
      await get().fetchJobs(true);
      const updatedJob = get().jobs.find((job) => job.id === jobId) || null;
      set({ editingJob: null, isEditing: false });
      return updatedJob;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return null;
    }
  },

  deleteJob: async (jobId: string) => {
    set({ error: null });
    try {
      await cronJobsApi.deleteCronJob(jobId);
      set({ jobs: get().jobs.filter((job) => job.id !== jobId) });
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  pauseJob: async (jobId: string) => {
    try {
      await cronJobsApi.toggleCronJob(jobId, false);
      set({
        jobs: get().jobs.map((job) => (job.id === jobId ? { ...job, enabled: false } : job)),
      });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  resumeJob: async (jobId: string) => {
    try {
      await cronJobsApi.toggleCronJob(jobId, true);
      set({
        jobs: get().jobs.map((job) => (job.id === jobId ? { ...job, enabled: true } : job)),
      });
    } catch (err) {
      set({ error: getErrorMessage(err) });
    }
  },

  triggerJob: async (jobId: string) => {
    try {
      await cronJobsApi.triggerCronJob(jobId);
      return true;
    } catch (err) {
      set({ error: getErrorMessage(err) });
      return false;
    }
  },

  setEditingJob: (job: CronJob | null) => {
    set({ editingJob: job, isEditing: !!job });
  },

  clearSelectedJob: () => {
    set({ selectedJob: null, jobOutputs: [] });
  },

  clearError: () => {
    set({ error: null });
  },
}));
