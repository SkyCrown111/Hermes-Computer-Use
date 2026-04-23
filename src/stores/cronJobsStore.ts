// Cron Jobs Store - 定时任务状态管理

import { create } from 'zustand';
import type { CronJob, CronJobOutput } from '../types/cron';
import { cronJobsApi } from '../services/cronJobsApi';

export interface CreateCronJobParams {
  name: string;
  prompt: string;
  schedule: string;
  skills?: string[];
  deliver?: string;
}

interface CronJobsState {
  // 任务列表
  jobs: CronJob[];
  isLoadingJobs: boolean;
  
  // 选中的任务
  selectedJob: CronJob | null;
  isLoadingDetail: boolean;
  
  // 执行历史
  jobOutputs: CronJobOutput[];
  isLoadingOutputs: boolean;
  
  // 表单状态
  isEditing: boolean;
  editingJob: CronJob | null;
  
  // 错误
  error: string | null;
  
  // Actions
  fetchJobs: () => Promise<void>;
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
  // 初始状态
  jobs: [],
  isLoadingJobs: false,
  selectedJob: null,
  isLoadingDetail: false,
  jobOutputs: [],
  isLoadingOutputs: false,
  isEditing: false,
  editingJob: null,
  error: null,

  // 获取任务列表
  fetchJobs: async () => {
    set({ isLoadingJobs: true, error: null });
    try {
      const { jobs } = await cronJobsApi.listCronJobs();
      set({ jobs, isLoadingJobs: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingJobs: false });
    }
  },

  // 获取任务详情
  fetchJobDetail: async (jobId: string) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const job = await cronJobsApi.getCronJob(jobId);
      set({ selectedJob: job, isLoadingDetail: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingDetail: false });
    }
  },

  // 获取执行历史
  fetchJobOutputs: async (jobId: string, limit = 10) => {
    set({ isLoadingOutputs: true });
    try {
      const outputs = await cronJobsApi.getCronOutputs(jobId, limit);
      set({ jobOutputs: outputs || [], isLoadingOutputs: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoadingOutputs: false });
    }
  },

  // 创建任务
  createJob: async (params: CreateCronJobParams) => {
    set({ error: null });
    try {
      const newJob = {
        id: crypto.randomUUID(),
        ...params,
        enabled: true,
        run_count: 0,
        schedule: { kind: 'interval' as const, display: params.schedule, minutes: 60 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as CronJob;
      await cronJobsApi.saveCronJob(newJob);
      const jobs = [...get().jobs, newJob];
      set({ jobs });
      return newJob;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  // 更新任务
  updateJob: async (jobId: string, updates: Partial<CreateCronJobParams>) => {
    set({ error: null });
    try {
      const existingJob = get().jobs.find(j => j.id === jobId);
      if (!existingJob) throw new Error('Job not found');
      
      const updatedJob = {
        ...existingJob,
        ...updates,
        schedule: updates.schedule 
          ? { kind: 'interval' as const, display: updates.schedule, minutes: 60 }
          : existingJob.schedule,
        updated_at: new Date().toISOString(),
      } as CronJob;
      
      await cronJobsApi.saveCronJob(updatedJob);
      const jobs = get().jobs.map((job) =>
        job.id === jobId ? updatedJob : job
      );
      set({ jobs, editingJob: null, isEditing: false });
      return updatedJob;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  // 删除任务
  deleteJob: async (jobId: string) => {
    set({ error: null });
    try {
      await cronJobsApi.deleteCronJob(jobId);
      const jobs = get().jobs.filter((job) => job.id !== jobId);
      set({ jobs });
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 暂停任务
  pauseJob: async (jobId: string) => {
    try {
      await cronJobsApi.toggleCronJob(jobId, false);
      const jobs = get().jobs.map((job) =>
        job.id === jobId ? { ...job, enabled: false } : job
      );
      set({ jobs });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // 恢复任务
  resumeJob: async (jobId: string) => {
    try {
      await cronJobsApi.toggleCronJob(jobId, true);
      const jobs = get().jobs.map((job) =>
        job.id === jobId ? { ...job, enabled: true } : job
      );
      set({ jobs });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // 手动触发任务
  triggerJob: async (jobId: string) => {
    try {
      await cronJobsApi.triggerCronJob(jobId);
      return true;
    } catch (err) {
      set({ error: (err as Error).message });
      return false;
    }
  },

  // 设置编辑中的任务
  setEditingJob: (job: CronJob | null) => {
    set({ editingJob: job, isEditing: !!job });
  },

  // 清除选中的任务
  clearSelectedJob: () => {
    set({ selectedJob: null, jobOutputs: [] });
  },

  // 清除错误
  clearError: () => {
    set({ error: null });
  },
}));
