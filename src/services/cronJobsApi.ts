import { apiClient, getErrorDetail } from './apiClient';
import { logger } from '../lib/logger';
import { DEFAULT_PATHS } from './constants';
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

interface BackendSchedule {
  kind: 'once' | 'interval' | 'cron';
  display: string;
  runAt?: string;
  minutes?: number;
  expr?: string;
}

interface BackendRepeatConfig {
  times: number | null;
  completed: number;
}

interface BackendModelOverride {
  provider?: string;
  model?: string;
}

interface BackendCronJobOrigin {
  platform: string;
  chatId: string;
  chatName?: string | null;
  threadId?: string | null;
}

interface BackendCronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: BackendSchedule;
  enabled: boolean;
  deliver?: string;
  skills?: string[];
  createdAt?: string;
  created_at?: string;
  lastRunAt?: string | null;
  last_run_at?: string | null;
  nextRunAt?: string | null;
  next_run_at?: string | null;
  runCount?: number;
  run_count?: number;
  repeat?: BackendRepeatConfig;
  modelOverride?: BackendModelOverride;
  model_override?: BackendModelOverride;
  origin?: BackendCronJobOrigin | {
    platform: string;
    chat_id: string;
    chat_name?: string | null;
    thread_id?: string | null;
  };
}

function mapCronJob(job: BackendCronJob): CronJob {
  let origin: CronJob['origin'];
  if (job.origin) {
    if ('chat_id' in job.origin) {
      origin = {
        platform: job.origin.platform,
        chat_id: job.origin.chat_id,
        chat_name: job.origin.chat_name ?? undefined,
        thread_id: job.origin.thread_id ?? undefined,
      };
    } else {
      origin = {
        platform: job.origin.platform,
        chat_id: job.origin.chatId,
        chat_name: job.origin.chatName ?? undefined,
        thread_id: job.origin.threadId ?? undefined,
      };
    }
  }

  return {
    id: job.id,
    name: job.name,
    prompt: job.prompt,
    schedule: {
      kind: job.schedule.kind,
      display: job.schedule.display,
      run_at: job.schedule.runAt,
      minutes: job.schedule.minutes,
      expr: job.schedule.expr,
    },
    enabled: job.enabled,
    deliver: job.deliver,
    skills: job.skills ?? [],
    created_at: job.created_at ?? job.createdAt ?? '',
    last_run_at: job.last_run_at ?? job.lastRunAt ?? undefined,
    next_run_at: job.next_run_at ?? job.nextRunAt ?? undefined,
    run_count: job.run_count ?? job.runCount ?? job.repeat?.completed ?? 0,
    repeat: job.repeat,
    model_override: job.model_override ?? job.modelOverride,
    origin,
  };
}

export async function listCronJobs(): Promise<CronJob[]> {
  try {
    const jobs = await apiClient.invokeShared<BackendCronJob[]>('list_cron_jobs');
    return jobs.map(mapCronJob);
  } catch (error) {
    logger.error(`[CronApi] listCronJobs failed: ${getErrorDetail(error)}`);
    return [];
  }
}

export async function getCronJob(jobId: string): Promise<CronJob | null> {
  try {
    const job = await apiClient.invoke<BackendCronJob>('get_cron_job', { job_id: jobId });
    return mapCronJob(job);
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
  } catch (error) {
    logger.debug('[CronJobs] getCronPath failed, using default:', getErrorDetail(error));
    return DEFAULT_PATHS.cron;
  }
}
