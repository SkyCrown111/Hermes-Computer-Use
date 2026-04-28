import { apiClient, getErrorDetail } from './apiClient';
import type {
  CronJob,
  CreateCronJobParams,
  UpdateCronJobParams,
  CronJobPauseResponse,
  CronJobResumeResponse,
  CronJobTriggerResponse,
  CronJobOutputResponse,
} from '../types/cron';
import type { ApiOkResponse } from '../types/common';
import { logger } from '../lib/logger';

export async function listCronJobs(): Promise<CronJob[]> {
  try {
    return await apiClient.invoke<CronJob[]>('list_cron_jobs');
  } catch (error) {
    logger.error(`[CronApi] listCronJobs failed: ${getErrorDetail(error)}`);
    return [];
  }
}

export async function getCronJob(jobId: string): Promise<CronJob | null> {
  try {
    return await apiClient.invoke<CronJob>('get_cron_job', { job_id: jobId });
  } catch (error) {
    logger.error(`[CronApi] getCronJob failed: ${getErrorDetail(error)}`);
    return null;
  }
}

export async function createCronJob(params: CreateCronJobParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('save_cron_job', {
    name: params.name,
    prompt: params.prompt,
    schedule: params.schedule,
    deliver: params.deliver,
    skills: params.skills,
    repeat: params.repeat,
    model_override: params.model_override,
  });
}

export async function updateCronJob(jobId: string, params: UpdateCronJobParams): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('save_cron_job', {
    job_id: jobId,
    ...params.updates,
  });
}

export async function deleteCronJob(jobId: string): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('delete_cron_job', { job_id: jobId });
}

export async function toggleCronJob(jobId: string, enabled: boolean): Promise<ApiOkResponse> {
  return apiClient.invoke<ApiOkResponse>('toggle_cron_job', { job_id: jobId, enabled });
}

export async function pauseCronJob(jobId: string): Promise<CronJobPauseResponse> {
  return apiClient.invoke<CronJobPauseResponse>('pause_cron_job', { job_id: jobId });
}

export async function resumeCronJob(jobId: string): Promise<CronJobResumeResponse> {
  return apiClient.invoke<CronJobResumeResponse>('resume_cron_job', { job_id: jobId });
}

export async function triggerCronJob(jobId: string): Promise<CronJobTriggerResponse> {
  return apiClient.invoke<CronJobTriggerResponse>('trigger_cron_job', { job_id: jobId });
}

export async function getCronJobOutputs(jobId: string): Promise<CronJobOutputResponse> {
  try {
    return await apiClient.invoke<CronJobOutputResponse>('get_cron_outputs', { job_id: jobId });
  } catch (error) {
    logger.error(`[CronApi] getCronJobOutputs failed: ${getErrorDetail(error)}`);
    return { job_id: jobId, outputs: [] };
  }
}

export async function getCronPath(): Promise<string> {
  try {
    return await apiClient.invoke<string>('get_cron_path');
  } catch {
    return '~/.hermes/cron';
  }
}
