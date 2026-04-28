export interface Schedule {
  kind: 'once' | 'interval' | 'cron';
  display: string;
  run_at?: string;
  minutes?: number;
  expr?: string;
}

export interface RepeatConfig {
  times: number | null;
  completed: number;
}

export interface ModelOverride {
  provider?: string;
  model?: string;
}

export interface CronJobOrigin {
  platform: string;
  chat_id: string;
  chat_name?: string;
  thread_id?: string;
}

export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule: Schedule;
  enabled: boolean;
  deliver?: string;
  skills?: string[];
  created_at: string;
  last_run_at?: string;
  next_run_at?: string;
  run_count: number;
  repeat?: RepeatConfig;
  model_override?: ModelOverride;
  origin?: CronJobOrigin;
}

export interface CreateCronJobParams {
  name: string;
  prompt: string;
  schedule: string;
  deliver?: string;
  skills?: string[];
  repeat?: { times: number };
  model_override?: ModelOverride;
}

export interface UpdateCronJobParams {
  updates: {
    name?: string;
    prompt?: string;
    schedule?: string;
    skills?: string[];
    deliver?: string;
    model_override?: ModelOverride;
  };
}

export interface CronJobPauseResponse {
  id: string;
  enabled: boolean;
  paused_at: string;
}

export interface CronJobResumeResponse {
  id: string;
  enabled: boolean;
  resumed_at: string;
  next_run_at: string;
}

export interface CronJobTriggerResponse {
  id: string;
  triggered: boolean;
  triggered_at: string;
}

export interface CronJobOutput {
  id: string;
  job_id: string;
  status: string;
  output: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface CronJobOutputResponse {
  job_id: string;
  outputs: CronJobOutput[];
}
