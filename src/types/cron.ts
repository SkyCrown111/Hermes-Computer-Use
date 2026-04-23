// Cron Job 定时任务类型定义

export interface Schedule {
  kind: 'interval' | 'cron' | 'once' | 'duration';
  minutes?: number;
  display: string;
}

export interface RepeatConfig {
  times: number | null;
  completed: number;
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
  model_override?: {
    provider: string;
    model: string;
  };
  origin?: {
    platform: string;
    chat_id: string;
  };
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
