// Cron Jobs API Service - Tauri Commands

import { safeInvoke } from '../lib/tauri';
import type { CronJob } from '../types/cron';

export interface CronJobListResponse {
  jobs: CronJob[];
  total: number;
}

// List all cron jobs
export async function listCronJobs(): Promise<CronJobListResponse> {
  const jobs = await safeInvoke<CronJob[]>('list_cron_jobs');
  return {
    jobs: jobs || [],
    total: jobs?.length || 0,
  };
}

// Get a single cron job by ID
export async function getCronJob(id: string): Promise<CronJob> {
  return safeInvoke<CronJob>('get_cron_job', { id });
}

// Save a cron job
export async function saveCronJob(job: CronJob): Promise<void> {
  await safeInvoke('save_cron_job', { job });
}

// Delete a cron job
export async function deleteCronJob(id: string): Promise<void> {
  await safeInvoke('delete_cron_job', { id });
}

// Toggle a cron job (enable/disable)
export async function toggleCronJob(id: string, enabled: boolean): Promise<void> {
  await safeInvoke('toggle_cron_job', { id, enabled });
}

// Get cron directory path
export async function getCronPath(): Promise<string> {
  return safeInvoke<string>('get_cron_path');
}

// Trigger a cron job manually
export async function triggerCronJob(id: string): Promise<void> {
  await safeInvoke('trigger_cron_job', { id });
}

// Get cron job execution outputs
export interface CronJobOutput {
  id: string;
  job_id: string;
  status: string;
  output: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export async function getCronOutputs(jobId: string, limit?: number): Promise<CronJobOutput[]> {
  return safeInvoke<CronJobOutput[]>('get_cron_outputs', { jobId, limit });
}

// Export all functions
export const cronJobsApi = {
  listCronJobs,
  getCronJob,
  saveCronJob,
  deleteCronJob,
  toggleCronJob,
  getCronPath,
  triggerCronJob,
  getCronOutputs,
};
